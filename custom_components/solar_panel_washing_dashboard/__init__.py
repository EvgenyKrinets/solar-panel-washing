"""Provision a dedicated, editable Lovelace dashboard on explicit integration setup.

Never edits an existing dashboard. Uses Home Assistant's Lovelace storage API.
"""
from __future__ import annotations

import logging
from pathlib import Path
from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace import dashboard as lovelace_dashboard
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, DASHBOARD_PATH, DASHBOARD_TITLE

_LOGGER = logging.getLogger(__name__)

SECTIONS = (
    "control", "schedule", "zones", "water-times", "detergent-times",
    "rinse-times", "switching", "flow-protection", "system", "manual-valves",
)


def _dashboard_config() -> dict:
    """Create separate, movable cards in a responsive Sections view."""
    return {
        "title": DASHBOARD_TITLE,
        "views": [{
            "title": "Washing",
            "path": "washing",
            "icon": "mdi:solar-panel",
            "type": "panel",
            "cards": [{"type": "custom:solar-panel-washing-overview-card"}],
        }],
    }



async def _upgrade_generated_dashboard(store) -> None:
    """Upgrade the unmodified generated layout; preserve user-customized dashboards."""
    try:
        config = await store.async_load(False)
    except (HomeAssistantError, ValueError, KeyError):
        _LOGGER.exception("Could not load washing dashboard for layout upgrade")
        return
    views = config.get("views", [])
    if len(views) != 1:
        return
    view = views[0]
    if view.get("type") != "sections":
        return
    sections = view.get("sections", [])
    if len(sections) != len(SECTIONS):
        return
    card_types = []
    for section in sections:
        cards = section.get("cards", [])
        if len(cards) != 1:
            return
        card_types.append(cards[0].get("type"))
    expected = [f"custom:solar-panel-washing-{section}-card" for section in SECTIONS]
    if card_types != expected:
        _LOGGER.info("Custom washing dashboard layout detected; preserving user edits")
        return
    view.pop("sections", None)
    view.pop("max_columns", None)
    view["type"] = "panel"
    view["cards"] = [{"type": "custom:solar-panel-washing-overview-card"}]
    await store.async_save(config)
    _LOGGER.info("Upgraded generated washing dashboard to responsive overview")




async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Install dashboard once; never overwrite an existing user's dashboard."""
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            "/solar-panel-washing/v1.3.4/solar-panel-washing.js",
            str(Path(__file__).parent / "solar-panel-washing.js"),
            False,
        )
    ])
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        _LOGGER.error("Lovelace has not been initialized")
        return False

    resource_url = "/solar-panel-washing/v1.3.4/solar-panel-washing.js"
    resources = lovelace.resources
    if hasattr(resources, "async_create_item"):
        await resources._async_ensure_loaded()
        existing = list(resources.async_items() or [])
        managed = next((r for r in existing if
                        str(r.get("url", "")).split("?")[0].startswith("/solar-panel-washing/")), None)
        if managed is None:
            await resources.async_create_item({"res_type": "module", "url": resource_url})
        elif managed.get("url") != resource_url:
            await resources.async_update_item(managed["id"], {"url": resource_url})
    else:
        _LOGGER.warning("Lovelace resources are YAML-managed; add %s as a module resource", resource_url)

    if DASHBOARD_PATH in lovelace.dashboards:
        await _upgrade_generated_dashboard(lovelace.dashboards[DASHBOARD_PATH])
        return True

    collection = lovelace_dashboard.DashboardsCollection(hass)
    await collection.async_load()
    if any(item.get("url_path") == DASHBOARD_PATH for item in collection.async_items()):
        _LOGGER.info("Existing washing dashboard found in storage; leaving other settings unchanged")
        return True

    # Creating a dashboard is explicitly authorized by adding this integration.
    try:
        item = await collection.async_create_item({
            "url_path": DASHBOARD_PATH,
            "title": DASHBOARD_TITLE,
            "icon": "mdi:solar-panel",
            "show_in_sidebar": True,
            "require_admin": False,
        })
        store = lovelace_dashboard.LovelaceStorage(hass, item)
        await store.async_save(_dashboard_config())
        # This collection is independent from the core collection's listener,
        # so register the panel in this running HA session as well.
        lovelace.dashboards[DASHBOARD_PATH] = store
        frontend.async_register_built_in_panel(
            hass, "lovelace",
            frontend_url_path=DASHBOARD_PATH,
            require_admin=False,
            show_in_sidebar=True,
            sidebar_title=DASHBOARD_TITLE,
            sidebar_icon="mdi:solar-panel",
            config={"mode": MODE_STORAGE},
        )
        _LOGGER.info("Created Solar Panel Washing dashboard at /%s/washing", DASHBOARD_PATH)
    except (HomeAssistantError, ValueError, KeyError):
        _LOGGER.exception("Could not provision Solar Panel Washing dashboard")
        return False
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Never delete the user's dashboard on uninstall."""
    return True
