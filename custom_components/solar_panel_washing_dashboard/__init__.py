"""Provision a dedicated, editable Lovelace dashboard on explicit integration setup.

Never edits an existing dashboard. Uses Home Assistant's Lovelace storage API.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime
import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from pathlib import Path
from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace import dashboard as lovelace_dashboard
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, DASHBOARD_PATH, DASHBOARD_TITLE
from .settings_storage import async_setup_settings_sync

_LOGGER = logging.getLogger(__name__)
_WATER_ENTITIES = (
    "sensor.solar_panel_washing_total_water",
    "sensor.solar_panel_washing_current_wash_water",
    *(f"sensor.solar_panel_washing_wash_zone_{i}_water" for i in range(1, 6)),
)
_SNAPSHOT_KEY = f"{DOMAIN}_water_snapshots"


async def _setup_water_snapshots(hass: HomeAssistant) -> None:
    """Store a daily 06:00 local backup independent of Recorder retention."""
    if hass.data.get(_SNAPSHOT_KEY):
        return
    store = Store(hass, 1, _SNAPSHOT_KEY)
    snapshots = await store.async_load() or []
    hass.data[_SNAPSHOT_KEY] = {"snapshots": snapshots, "store": store}

    async def save_snapshot(force: bool = False) -> bool:
        values = []
        for entity_id in _WATER_ENTITIES:
            state = hass.states.get(entity_id)
            try:
                value = float(state.state) if state else float("nan")
            except (ValueError, TypeError):
                value = float("nan")
            if not math.isfinite(value) or value < 0:
                _LOGGER.warning("Skipping incomplete water snapshot: %s", entity_id)
                return False
            values.append(value)
        timestamp = dt_util.now().isoformat()
        day = dt_util.now().date().isoformat()
        records = hass.data[_SNAPSHOT_KEY]["snapshots"]
        if not force and any(x.get("date") == day and x.get("source") == "daily" for x in records):
            return True
        records.append({"date": day, "time": timestamp, "values": values, "source": "manual" if force else "daily"})
        await store.async_save(records)
        _LOGGER.info("Saved daily water snapshot for %s", day)
        return True

    async def snapshot_service(call) -> None:
        if not await save_snapshot(force=True):
            raise HomeAssistantError("Cannot save water snapshot: one or more counters are unavailable")

    @websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/water_snapshots"})
    @websocket_api.async_response
    async def handle_snapshots(hass, connection, msg) -> None:
        connection.send_result(msg["id"], hass.data[_SNAPSHOT_KEY]["snapshots"])

    websocket_api.async_register_command(hass, handle_snapshots)
    hass.services.async_register(DOMAIN, "save_water_snapshot", snapshot_service)

    def scheduled_snapshot(now: datetime) -> None:
        hass.async_create_task(save_snapshot())

    hass.data[_SNAPSHOT_KEY]["unsub"] = async_track_time_change(
        hass, scheduled_snapshot, hour=6, minute=0, second=0
    )


SECTIONS = (
    "control", "schedule", "zones", "water-times", "detergent-times",
    "rinse-times", "switching", "flow-protection", "system", "water-consumption", "manual-valves",
)


def _dashboard_config() -> dict:
    """Native Lovelace masonry: independently editable and movable cards."""
    return {
        "title": DASHBOARD_TITLE,
        "views": [{
            "title": "Washing",
            "path": "washing",
            "icon": "mdi:solar-panel",
            "type": "masonry",
            "cards": [
                {"type": f"custom:solar-panel-washing-{section}-card"}
                for section in (
                    "control", "switching", "schedule", "water-times",
                    "detergent-times", "zones", "rinse-times",
                    "manual-valves", "flow-protection", "system", "water-consumption"
                )
            ],
        }],
    }


async def _upgrade_generated_dashboard(store) -> None:
    """Convert only the exact generated overview into real HA cards.

    User-customized dashboards and unrelated views remain untouched.
    """
    try:
        config = await store.async_load(False)
    except (HomeAssistantError, ValueError, KeyError):
        _LOGGER.exception("Unable to load washing dashboard")
        return
    views = config.get("views", [])
    if len(views) != 1:
        return
    view = views[0]
    cards = view.get("cards", [])
    # Only augment dashboards that still contain all ten generated cards.
    # Never replace user layouts or touch dashboards with a custom selection.
    generated = {f"custom:solar-panel-washing-{name}-card"
                 for name in SECTIONS if name != "water-consumption"}
    present = {card.get("type") for card in cards}
    if (generated.issubset(present) and
            "custom:solar-panel-washing-water-consumption-card" not in present):
        view.setdefault("cards", []).append({
            "type": "custom:solar-panel-washing-water-consumption-card"
        })
        await store.async_save(config)
        _LOGGER.info("Added independent water consumption card to washing dashboard")
        return
    if view.get("type") != "panel" or len(cards) != 1:
        return
    if cards[0].get("type") != "custom:solar-panel-washing-overview-card":
        return
    # Preserve any custom settings on the overview and propagate them.
    settings = {k: v for k, v in cards[0].items() if k != "type"}
    replacement = _dashboard_config()["views"][0]
    view["type"] = "masonry"
    view["cards"] = [{**card, **settings} for card in replacement["cards"]]
    await store.async_save(config)
    _LOGGER.info("Migrated washing overview to independently editable masonry cards")


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Install dashboard once; never overwrite an existing user's dashboard."""
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            "/solar-panel-washing/v1.3.31/solar-panel-washing.js",
            str(Path(__file__).parent / "solar-panel-washing.js"),
            False,
        )
    ])
    await _setup_water_snapshots(hass)
    await async_setup_settings_sync(hass)
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        _LOGGER.error("Lovelace has not been initialized")
        return False

    resource_url = "/solar-panel-washing/v1.3.31/solar-panel-washing.js"
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
