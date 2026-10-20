"""Durable HA-owned controller configuration and counter storage.

Upgrade procedure: install/restart HA integration first, while old ESP firmware is
online, and verify .storage snapshot BEFORE OTA. The new firmware never persists
settings or counters to ESP32 flash.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timedelta, timezone

import voluptuous as vol
from homeassistant.components import websocket_api

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_interval
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
_HISTORY_KEY = f"{DOMAIN}_controller_history"
_BAD = ("unknown", "unavailable", "")


async def async_setup_settings_sync(hass: HomeAssistant) -> None:
    """Register durable snapshot, recovery, and periodic retry."""
    if hass.data.get(_STORE_KEY):
        return
    store = Store(hass, 1, _STORE_KEY)
    saved = await store.async_load()
    history_store = Store(hass, 1, _HISTORY_KEY)
    existing_history = await history_store.async_load()
    history = existing_history if isinstance(existing_history, list) else []
    data = {"store": store, "snapshot": saved if isinstance(saved, dict) else None,
            "history_store": history_store, "history": history,
            "busy": False, "unsub": [], "lock": asyncio.Lock()}
    hass.data[_STORE_KEY] = data

    def historical_timestamp(record: dict) -> datetime | None:
        try:
            timestamp = datetime.fromisoformat(record["saved_at"].replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            if timestamp > dt_util.utcnow() + timedelta(minutes=1):
                return None
            return timestamp.astimezone(timezone.utc)
        except (TypeError, ValueError, KeyError, AttributeError):
            return None

    def validate_snapshot(snapshot: dict) -> bool:
        """Refuse partial or malformed restores (including one missing entity)."""
        if not isinstance(snapshot, dict):
            return False
        settings = snapshot.get("settings")
        counters = snapshot.get("counters")
        if not isinstance(settings, dict) or set(settings) != set(_SETTINGS):
            return False
        if not isinstance(counters, list) or len(counters) != len(_COUNTERS):
            return False
        if historical_timestamp(snapshot) is None:
            return False
        for entity_id, kind in _SETTINGS.items():
            value = settings[entity_id]
            if kind == "switch":
                if value not in ("on", "off"):
                    return False
            elif kind == "select":
                if value not in ("Water", "Detergent + Water"):
                    return False
            else:
                try:
                    number = float(value)
                    if not math.isfinite(number):
                        return False
                except (ValueError, TypeError):
                    return False
                current = hass.states.get(entity_id)
                if current:
                    bounds = current.attributes
                    if ("min" in bounds and number < float(bounds["min"]) - 0.0001 or
                            "max" in bounds and number > float(bounds["max"]) + 0.0001):
                        return False
        for value in counters:
            try:
                number = float(value)
                if not math.isfinite(number) or number < 0 or number > 100000000:
                    return False
            except (ValueError, TypeError):
                return False
        return True

    async def journal(snapshot: dict, *, force: bool = False) -> None:
        """Keep a bounded 30-day full-state history in HA, never on ESP Flash."""
        if not validate_snapshot(snapshot):
            return
        now = dt_util.utcnow()
        records = data["history"]
        last = records[-1] if records else None
        timestamp = historical_timestamp(last) if last else None
        should_append = (
            force or not last or timestamp is None or
            last.get("settings") != snapshot["settings"] or
            now - timestamp >= timedelta(minutes=15)
        )
        if not should_append:
            return
        records.append(snapshot.copy())
        threshold = now - timedelta(days=30)
        records[:] = [x for x in records
                      if isinstance(x, dict)
                      and (dt := historical_timestamp(x)) is not None
                      and dt >= threshold][-3500:]
        await history_store.async_save(records)

    # Seed the historical store from the pre-existing, durable HA snapshot.
    if not history and validate_snapshot(data["snapshot"]):
        async with data["lock"]:
            await journal(data["snapshot"], force=True)

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
            await journal(snapshot, force=force)
        return True

    async def restore(force: bool = False, selected: dict | None = None) -> bool:
        snapshot = selected if selected is not None else data["snapshot"]
        if not snapshot or data["busy"]:
            return False
        ready = hass.states.get(_READY)
        if ready is None or (ready.state != "off" and not (force and ready.state == "on")):
            return False
        if not validate_snapshot(snapshot):
            return False
        settings = snapshot["settings"]
        counters = snapshot["counters"]
        service_domain = "esphome"
        water_action = "solar_panel_washing_restore_water_counters"
        finish_action = "solar_panel_washing_finish_restore"
        prepare_action = "solar_panel_washing_prepare_restore"
        if not hass.services.has_service(service_domain, water_action) or not hass.services.has_service(service_domain, finish_action) or not hass.services.has_service(service_domain, prepare_action):
            return False
        data["busy"] = True
        try:
            # Only the ESP32 can authorize a safe restore: lock starts first.
            await hass.services.async_call(service_domain, prepare_action, {}, blocking=True)
            await asyncio.sleep(0.5)
            ready_now = hass.states.get(_READY)
            if ready_now is None or ready_now.state != "off":
                raise HomeAssistantError("ESP32 rejected restore: active wash or energized output")
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
            # API action performs a delayed restore on the ESP32 side.
            await asyncio.sleep(2)
            auto_id = f"switch.{_PREFIX}automatic_wash_start"
            await hass.services.async_call(
                "switch", "turn_on" if settings[auto_id] == "on" else "turn_off",
                {"entity_id": auto_id}, blocking=True,
            )
            # ESP firmware refuses ACK unless all physical outputs are OFF.
            await hass.services.async_call(service_domain, finish_action, {}, blocking=True)
            # Service calls may complete before the ESPHome binary sensor updates.
            for _ in range(24):
                if (state := hass.states.get(_READY)) and state.state == "on":
                    break
                await asyncio.sleep(0.25)
            else:
                raise HomeAssistantError("ESP32 did not acknowledge successful restore")
            if selected is not None:
                # The historical selection becomes the new current backup.
                updated = {**selected, "saved_at": dt_util.utcnow().isoformat(),
                           "restored_from": selected["saved_at"]}
                async with data["lock"]:
                    data["snapshot"] = updated
                    await store.async_save(updated)
                    await journal(updated, force=True)
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

    async def restore_historical(call) -> None:
        candidate = {"version": 1, "settings": call.data["settings"],
                     "counters": call.data["counters"],
                     "saved_at": call.data["recorded_at"]}
        if not validate_snapshot(candidate):
            raise HomeAssistantError("Historical state is incomplete, invalid or out of range")
        if not await restore(force=True, selected=candidate):
            raise HomeAssistantError("Historical restore failed: ESP32 busy, unavailable, or unsafe")

    @websocket_api.websocket_command({
        vol.Required("type"): f"{DOMAIN}/controller_snapshot_at",
        vol.Required("at"): str,
    })
    @websocket_api.async_response
    async def snapshot_at(hass, connection, msg) -> None:
        try:
            chosen = datetime.fromisoformat(msg["at"].replace("Z", "+00:00"))
            if chosen.tzinfo is None or chosen > dt_util.utcnow():
                raise ValueError("Invalid or future date")
            eligible = [record for record in data["history"]
                        if validate_snapshot(record)
                        and (timestamp := historical_timestamp(record)) is not None
                        and timestamp <= chosen]
            if data["snapshot"] and validate_snapshot(data["snapshot"]):
                stamp = historical_timestamp(data["snapshot"])
                if stamp and stamp <= chosen:
                    eligible.append(data["snapshot"])
            eligible.sort(key=lambda record: historical_timestamp(record))
            connection.send_result(msg["id"], eligible[-1] if eligible else None)
        except (TypeError, ValueError) as err:
            connection.send_error(msg["id"], "invalid_date", str(err))

    websocket_api.async_register_command(hass, snapshot_at)
    hass.services.async_register(DOMAIN, "restore_historical_state",
        restore_historical, schema=vol.Schema({
            vol.Required("settings"): dict,
            vol.Required("counters"): list,
            vol.Required("recorded_at"): str,
        }))

    hass.services.async_register(DOMAIN, "save_settings", manual_backup)
    hass.services.async_register(DOMAIN, "restore_settings", manual_restore)
    data["unsub"].append(async_track_time_interval(hass, poll, timedelta(seconds=30)))
    # Starting capture now supports migration from legacy 1.3.30 before OTA.
    hass.async_create_task(poll())
