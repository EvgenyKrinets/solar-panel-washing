"""Durable HA-owned controller configuration and counter storage.

Upgrade procedure: install/restart HA integration first, while old ESP firmware is
online, and verify .storage snapshot BEFORE OTA. The new firmware never persists
settings or counters to ESP32 flash.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
_PREFIX = "solar_panel_washing_"
_DAY_NAMES = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_SWITCH_NAMES = (
    *(f"zone_{i}_enabled" for i in range(1, 6)),
    "flow_protection", "automatic_wash_start",
    *(f"auto_start_{day}" for day in _DAY_NAMES),
)
_SELECT_NAMES = ("wash_mode", *(f"auto_mode_{day}" for day in _DAY_NAMES))
_NUMBER_NAMES = (
    *(f"{kind}_time_zone_{i}" for kind in ("water", "detergent", "rinse") for i in range(1, 6)),
    "zone_overlap", "source_change_delay", "minimum_flow_setpoint",
    "maximum_flow_setpoint", "leak_flow_setpoint", "flow_check_delay",
    "auto_start_hour", "auto_start_minute",
)
_SETTINGS = {
    **{f"switch.{_PREFIX}{name}": "switch" for name in _SWITCH_NAMES},
    **{f"select.{_PREFIX}{name}": "select" for name in _SELECT_NAMES},
    **{f"number.{_PREFIX}{name}": "number" for name in _NUMBER_NAMES},
}
_COUNTERS = (
    f"sensor.{_PREFIX}total_water",
    f"sensor.{_PREFIX}current_wash_water",
    *(f"sensor.{_PREFIX}wash_zone_{i}_water" for i in range(1, 6)),
)
_READY = f"binary_sensor.{_PREFIX}settings_synchronized"
_STORE_KEY = f"{DOMAIN}_controller_state"
_BAD = ("unknown", "unavailable", "")


async def async_setup_settings_sync(hass: HomeAssistant) -> None:
    """Register durable snapshot, recovery, and periodic retry."""
    if hass.data.get(_STORE_KEY):
        return
    store = Store(hass, 1, _STORE_KEY)
    saved = await store.async_load()
    data = {"store": store, "snapshot": saved if isinstance(saved, dict) else None,
            "busy": False, "unsub": [], "lock": asyncio.Lock()}
    hass.data[_STORE_KEY] = data

    def online() -> bool:
        st = hass.states.get(_READY)
        return st is not None and st.state in ("on", "off")

    async def capture(force: bool = False) -> bool:
        if data["busy"]:
            return False
        ready = hass.states.get(_READY)
        # NEVER overwrite a good HA backup with ESP defaults during reboot.
        if ready is not None and ready.state != "on":
            return False
        if ready is None and data["snapshot"] is not None and not force:
            # Never replace a durable snapshot with stale state at HA startup.
            return False
        values = {}
        for entity_id, kind in _SETTINGS.items():
            state = hass.states.get(entity_id)
            if not state or state.state in _BAD:
                return False
            v = state.state
            if kind == "switch" and v not in ("on", "off"):
                return False
            if kind == "number":
                try:
                    v = float(v)
                    if not math.isfinite(v):
                        return False
                except (TypeError, ValueError):
                    return False
            if kind == "select" and v not in ("Water", "Detergent + Water"):
                return False
            values[entity_id] = v
        counters = []
        for entity_id in _COUNTERS:
            state = hass.states.get(entity_id)
            try:
                v = float(state.state) if state else float("nan")
            except (TypeError, ValueError):
                return False
            if not math.isfinite(v) or v < 0 or v > 100000000:
                return False
            counters.append(v)
        snapshot = {"version": 1, "settings": values, "counters": counters,
                    "saved_at": dt_util.utcnow().isoformat()}
        if not force and data["snapshot"] is not None:
            previous = data["snapshot"]
            if previous.get("settings") == values and previous.get("counters") == counters:
                return True
        async with data["lock"]:
            data["snapshot"] = snapshot
            await store.async_save(snapshot)
        return True

    async def restore(force: bool = False) -> bool:
        snapshot = data["snapshot"]
        if not snapshot or data["busy"]:
            return False
        ready = hass.states.get(_READY)
        if ready is None or (ready.state != "off" and not (force and ready.state == "on")):
            return False
        settings = snapshot.get("settings")
        counters = snapshot.get("counters")
        if not isinstance(settings, dict) or len(settings) != len(_SETTINGS):
            return False
        if not isinstance(counters, list) or len(counters) != 7:
            return False
        service_domain = "esphome"
        water_action = "solar_panel_washing_restore_water_counters"
        finish_action = "solar_panel_washing_finish_restore"
        if not hass.services.has_service(service_domain, water_action) or not hass.services.has_service(service_domain, finish_action):
            return False
        data["busy"] = True
        try:
            # Keep scheduled starts disabled while applying configuration.
            for entity_id, kind in _SETTINGS.items():
                value = settings[entity_id]
                if kind == "switch":
                    # Automatic start is enabled LAST, immediately before ACK.
                    if entity_id.endswith("automatic_wash_start"):
                        continue
                    service = "turn_on" if value == "on" else "turn_off"
                    payload = {"entity_id": entity_id}
                elif kind == "number":
                    service = "set_value"
                    payload = {"entity_id": entity_id, "value": float(value)}
                else:
                    service = "select_option"
                    payload = {"entity_id": entity_id, "option": str(value)}
                await hass.services.async_call(kind, service, payload, blocking=True)
            await hass.services.async_call(
                service_domain, water_action,
                dict(zip(("total", "wash", "zone1", "zone2", "zone3", "zone4", "zone5"), counters)),
                blocking=True,
            )
            auto_id = f"switch.{_PREFIX}automatic_wash_start"
            await hass.services.async_call(
                "switch", "turn_on" if settings[auto_id] == "on" else "turn_off",
                {"entity_id": auto_id}, blocking=True,
            )
            # ESP firmware refuses ACK unless all physical outputs are OFF.
            await hass.services.async_call(service_domain, finish_action, {}, blocking=True)
            _LOGGER.info("ESP32 settings restored from Home Assistant storage")
            return True
        except Exception:
            _LOGGER.exception("ESP32 restore failed, scheduler remains inhibited")
            return False
        finally:
            data["busy"] = False

    async def poll(now=None) -> None:
        if data["busy"]:
            return
        ready = hass.states.get(_READY)
        if ready is not None and ready.state == "off":
            await restore()
        elif ready is None or ready.state == "on":
            await capture()

    async def manual_backup(call) -> None:
        if not await capture(force=True):
            raise HomeAssistantError("Could not capture complete online controller settings")

    async def manual_restore(call) -> None:
        if not await restore(force=True):
            raise HomeAssistantError("Restore unavailable: ESP32 not idle, offline or HA snapshot missing")

    hass.services.async_register(DOMAIN, "save_settings", manual_backup)
    hass.services.async_register(DOMAIN, "restore_settings", manual_restore)
    data["unsub"].append(async_track_time_interval(hass, poll, timedelta(seconds=30)))
    # Starting capture now supports migration from legacy 1.3.30 before OTA.
    hass.async_create_task(poll())
