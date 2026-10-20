"""HA-owned, timestamped configuration history and safe ESPHome restoration."""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import timedelta
from homeassistant.helpers.storage import Store
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.core import callback
from homeassistant.util import dt as dt_util
from homeassistant.exceptions import HomeAssistantError

_LOGGER = logging.getLogger(__name__)
PREFIX = "solar_panel_washing_"
DOMAIN = "solar_panel_washing_dashboard"
KEY = f"{DOMAIN}_settings_history"
EXCLUDE = ("ch1_", "ch2_", "ch3_", "ch4_", "ch5_", "ch6_", "ch7_", "ch8_")
WATER = ["total_water", "current_wash_water", *(f"wash_zone_{i}_water" for i in range(1, 6))]
CONFIG_SWITCHES = ["automatic_wash_start", "flow_protection", *(f"zone_{i}_enabled" for i in range(1, 6)),
                   *(f"auto_start_{day}" for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))]
CONFIG_SELECTS = ["wash_mode", *(f"auto_mode_{day}" for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))]
CONFIG_NUMBERS = [*(f"{stage}_time_zone_{i}" for stage in ("water", "detergent", "rinse") for i in range(1, 6)),
                  "zone_overlap", "source_change_delay", "minimum_flow_setpoint", "maximum_flow_setpoint",
                  "leak_flow_setpoint", "flow_check_delay", "auto_start_hour", "auto_start_minute"]
ENTITIES = ([f"switch.{PREFIX}{x}" for x in CONFIG_SWITCHES] +
            [f"select.{PREFIX}{x}" for x in CONFIG_SELECTS] +
            [f"number.{PREFIX}{x}" for x in CONFIG_NUMBERS] +
            [f"sensor.{PREFIX}{x}" for x in WATER])
SYNC_ENTITY = f"binary_sensor.{PREFIX}settings_synchronized"
ONLINE_ENTITY = f"binary_sensor.{PREFIX}washing_controller_online"
ACTIVE_ENTITY = f"binary_sensor.{PREFIX}washing_active"
RELAY_ENTITIES = [f"switch.{PREFIX}ch{i}_{name}" for i, name in enumerate(
    ("filtered_water", "detergent", "zone_1", "zone_2", "zone_3", "zone_4", "zone_5", "valve_power"), 1)]


def _valid(state):
    return state is not None and state.state not in ("unknown", "unavailable", "none", "")


class SettingsHistory:
    def __init__(self, hass):
        self.hass = hass
        self.store = Store(hass, 1, KEY)
        self.records = []
        self.latest = None
        self._saving = asyncio.Lock()
        self._restoring = False
        self._timer = None

    async def setup(self):
        data = await self.store.async_load() or {}
        self.records = data.get("records", [])
        self.latest = data.get("latest")
        @callback
        def changed(event):
            entity_id = event.data.get("entity_id")
            new = event.data.get("new_state")
            old = event.data.get("old_state")
            if entity_id == ONLINE_ENTITY and _valid(new) and new.state == "on" and (not old or old.state != "on"):
                self.hass.async_create_task(self.auto_restore())
            elif entity_id == SYNC_ENTITY and _valid(new) and new.state == "off":
                self.hass.async_create_task(self.auto_restore())
            elif entity_id in ENTITIES and _valid(new) and (not old or old.state != new.state) and not self._restoring:
                # The first snapshot is captured before any values are replaced.
                if self._timer:
                    self._timer()
                from homeassistant.helpers.event import async_call_later
                self._timer = async_call_later(self.hass, 3, self._save_later)
        async_track_state_change_event(self.hass, ENTITIES + [ONLINE_ENTITY, SYNC_ENTITY], changed)
        async_track_time_interval(self.hass, self._periodic, timedelta(minutes=1))
        from homeassistant.helpers.event import async_call_later
        async_call_later(self.hass, 12, self._startup)

    async def _startup(self, _now):
        if not self.latest:
            await self.capture()
        else:
            await self.auto_restore()

    async def _save_later(self, _now):
        self._timer = None
        await self.capture()

    async def _periodic(self, _now):
        if not self._restoring:
            await self.capture()

    async def capture(self):
        if self._restoring:
            return False
        synced = self.hass.states.get(SYNC_ENTITY)
        if synced is not None and synced.state != 'on':
            return False
        values = {}
        for entity_id in ENTITIES:
            state = self.hass.states.get(entity_id)
            if not _valid(state):
                return False
            if entity_id.startswith(("number.", "sensor.")):
                try:
                    number = float(state.state)
                except (ValueError, TypeError):
                    return False
                if not math.isfinite(number) or number < 0:
                    return False
                values[entity_id] = number
            else:
                values[entity_id] = state.state
        async with self._saving:
            if self.latest and self.latest.get("values") == values:
                return True
            record = {"time": dt_util.utcnow().isoformat(), "values": values}
            self.latest = record
            self.records.append(record)
            cutoff = dt_util.utcnow() - timedelta(days=180)
            self.records = [r for r in self.records if dt_util.parse_datetime(r["time"]) and
                            dt_util.as_utc(dt_util.parse_datetime(r["time"])) >= cutoff]
            await self.store.async_save({"latest": self.latest, "records": self.records})
        return True

    def preview(self, timestamp):
        when = dt_util.parse_datetime(timestamp)
        if not when:
            raise HomeAssistantError("Invalid date/time")
        when = dt_util.as_utc(when)
        matching = [r for r in self.records if dt_util.parse_datetime(r["time"]) and
                    dt_util.as_utc(dt_util.parse_datetime(r["time"])) <= when]
        if not matching:
            raise HomeAssistantError("No settings snapshot at or before the selected time")
        return matching[-1]

    def safe(self):
        return (self.hass.states.get(ACTIVE_ENTITY) is not None and
                self.hass.states.get(ACTIVE_ENTITY).state == "off" and
                all(self.hass.states.get(e) is not None and self.hass.states.get(e).state == "off"
                    for e in RELAY_ENTITIES))

    async def apply(self, record, automatic=False):
        if self._restoring:
            raise HomeAssistantError("Settings restoration is already running")
        if not self.safe():
            raise HomeAssistantError("Stop washing and turn off all eight relays before restoring")
        values = record["values"]
        if any(k not in values for k in ENTITIES):
            raise HomeAssistantError("Snapshot is incomplete")
        self._restoring = True
        try:
            # Auto-start remains OFF throughout configuration replay.
            await self.hass.services.async_call("switch", "turn_off", {"entity_id": f"switch.{PREFIX}automatic_wash_start"}, blocking=True)
            for entity_id in ENTITIES:
                if entity_id.startswith("sensor.") or entity_id == f"switch.{PREFIX}automatic_wash_start":
                    continue
                value = values[entity_id]
                domain = entity_id.split(".")[0]
                if domain == "switch":
                    service, data = ("turn_on" if value == "on" else "turn_off"), {"entity_id": entity_id}
                elif domain == "select":
                    service, data = "select_option", {"entity_id": entity_id, "option": value}
                else:
                    service, data = "set_value", {"entity_id": entity_id, "value": value}
                await self.hass.services.async_call(domain, service, data, blocking=True)
            water = [float(values[f"sensor.{PREFIX}{x}"]) for x in WATER]
            await self.hass.services.async_call("esphome", f"{PREFIX}restore_water_counters",
                                                dict(zip(("total", "wash", "zone1", "zone2", "zone3", "zone4", "zone5"), water)), blocking=True)
            await self.hass.services.async_call("esphome", f"{PREFIX}confirm_settings_synchronized", {}, blocking=True)
            if values[f"switch.{PREFIX}automatic_wash_start"] == "on":
                await self.hass.services.async_call("switch", "turn_on",
                                                    {"entity_id": f"switch.{PREFIX}automatic_wash_start"}, blocking=True)
            _LOGGER.info("Applied %s HA-owned settings to ESP32", len(values))
        finally:
            self._restoring = False

    async def auto_restore(self):
        if not self.latest or self._restoring:
            return
        online = self.hass.states.get(ONLINE_ENTITY)
        synced = self.hass.states.get(SYNC_ENTITY)
        if not online or online.state != "on" or not synced or synced.state != "off":
            return
        try:
            await self.apply(self.latest, automatic=True)
        except Exception:
            _LOGGER.exception("Automatic settings restore failed; ESP32 scheduler remains locked")
