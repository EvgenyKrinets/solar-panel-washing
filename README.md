<div align="center">

# Solar Panel Washing

### ESP32 / ESPHome automatic five-zone solar-panel washing with Home Assistant

[![Release](https://img.shields.io/badge/Version-1.3.27-blue)](VERSION)
[![ESPHome](https://img.shields.io/badge/ESPHome-ESP32--S3-000000?logo=esphome)](https://esphome.io/)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-HACS%20Integration-18BCF2?logo=homeassistant)](https://www.home-assistant.io/)
[![Languages](https://img.shields.io/badge/Languages-EN%20%7C%20RU%20%7C%20HE-1684d8)](#languages)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

![Solar Panel Washing system](assets/ChatGPT%20Image%20Oct%2011%2C%202026%2C%2009_53_43%20PM.png)

</div>

## What it does

**Solar Panel Washing** controls five rooftop solar-panel washing zones using a Waveshare ESP32-S3-ETH-8DI-8RO, ESPHome, and Home Assistant. The ESP32 executes the washing programs, schedules, valve sequencing and safety logic locally; Home Assistant provides configuration, live readings, controls, history and a responsive dashboard. The automatic program does not require a permanently connected Home Assistant frontend.

**Current release: v1.3.27.** The HACS integration and ESPHome firmware are separate parts of this repository. Updating the integration does **not** flash the ESP32.

## Features

- **Five independently enabled zones** with separate water, detergent and rinse durations.
- **Water-only** and **Detergent + Water** programs; selectable mode for each weekday.
- **Automatic weekly schedule** with weekday switches, hour/minute start time, and next-run display.
- **Manual START**, **Emergency Stop**, alarm reset, and a visible washing-active status indicator.
- **Valve overlap**: open the next zone before closing the previous; configurable source-change delay.
- **Eight relay outputs** for water, detergent, five zones and transformer/valve power.
- **Flow monitoring** in L/min even outside a washing cycle, including manual valve operation.
- **Water accounting**: total lifetime volume, current/last wash volume and five per-zone volumes, with daily and manual ESP32 and Home Assistant backups and historical restore.
- **Flow protection** with configurable minimum, maximum, unexpected/leak flow and startup delay. Keep disabled until the meter and thresholds are verified.
- **ESP32 system status**: connection, Wi-Fi signal, uptime, time and synchronization, IP, SSID, MAC, alarm and flow.
- **Native Home Assistant history**: tap flow or water readings to open the built-in More Info graph.
- **Eleven independent Lovelace cards**, automatically provisioned in a dedicated dashboard, or usable in other dashboards.
- **English, Russian and Hebrew** interface, with Hebrew RTL and responsive mobile layout.
- **Locally controlled relays**: outputs are turned off on reboot and a wash does not automatically resume.

## Hardware and wiring

Reference controller: **Waveshare ESP32-S3-ETH-8DI-8RO**. The firmware uses an I²C PCA9554 relay expander and the DI1 / GPIO4 input for the flow meter.

| Channel | Connected load |
| --- | --- |
| CH1 | Filtered water source valve |
| CH2 | Detergent source valve |
| CH3 | Zone 1 valve |
| CH4 | Zone 2 valve |
| CH5 | Zone 3 valve |
| CH6 | Zone 4 valve |
| CH7 | Zone 5 valve |
| CH8 | Valve transformer / power |

CH1 and CH2 are interlocked in ESPHome. The manual service controls bypass the normal washing sequence; operate them carefully.

**Flow meter:** YF-B5 G3/4, configured for **396 pulses per litre**, nominal working range **1–30 L/min**. The pulse counter reports **L/min** and accumulates litres. Below the manufacturer's minimum flow, the meter may undercount. Verify the particular meter's output voltage, input wiring and Waveshare DI1 electrical requirements; never apply the external meter supply voltage directly to an ESP32 3.3 V GPIO.

## Install with HACS (recommended)

This project is a **HACS Integration**, not a Dashboard/Frontend repository. Its Python integration bundles and registers the JavaScript frontend.

1. In **HACS → Custom repositories**, add `https://github.com/EvgenyKrinets/solar-panel-washing` as type **Integration**.
2. Install **Solar Panel Washing Dashboard**.
3. Restart Home Assistant.
4. Open **Settings → Devices & services → Add integration** and add **Solar Panel Washing Dashboard**.
5. The integration creates a dedicated **Solar Panel Washing** dashboard with independent cards. Existing user dashboards are not replaced.
6. Install or update the ESPHome firmware separately (instructions below) so the dashboard's entities exist.

**Migrating from the old frontend-only installation:** Remove the old HACS Dashboard/Frontend installation and any duplicate manually registered JS resource before installing the Integration version. Do not remove your ESPHome device or personal dashboards.

**Updating:** Update the integration in HACS and restart Home Assistant. The frontend resource is versioned to help invalidate cached JavaScript. If the old UI remains, reload the dashboard and check the resource registration. Existing custom dashboards are preserved; the standard generated dashboard can receive the new Water Consumption card automatically.

**YAML-managed Lovelace resources:** Automatic resource registration may not apply to manually YAML-managed resources; configure the integration's current bundled resource URL manually if necessary. Do not register duplicate resources.

## Install / update ESPHome firmware

1. Open [`esphome/solar-panel-washing.yaml`](esphome/solar-panel-washing.yaml) and copy it into ESPHome Device Builder.
2. Set your Wi-Fi credentials and API encryption secret in `secrets.yaml`; see [`esphome/secrets.example.yaml`](esphome/secrets.example.yaml). The API key is referenced as `!secret solar_panel_washing__encryption_key`.
3. **Validate** the YAML, then compile and install. Prefer **OTA** updates without erasing the device flash if you want to retain stored settings and the water counter.
4. Check the ESPHome entities in Home Assistant. Existing HA entity IDs may be retained after renaming; adjust dashboard references if your IDs differ.
5. Verify valve directions, zone assignments and flow readings before enabling flow protection or unattended scheduling.

**Firmware and integration updates are independent.** New UI features that use new ESPHome sensors require updating **both**.

## Dashboard: all 11 cards

In **Edit dashboard → Add card**, search for **Solar Washing**, or add a card using the types below. Cards can be rearranged independently in Home Assistant.

| Section | Custom card type suffix | What it controls or displays |
| --- | --- | --- |
| Washing Control | `control` | Wash mode, START, Emergency Stop, alarm reset, active status |
| Automatic Schedule | `schedule` | Weekdays, scheduled mode per day, start time, next run |
| Active Zones | `zones` | Enable/disable each of five zones |
| Water Times | `water-times` | Water duration for each zone |
| Detergent Times | `detergent-times` | Detergent duration for each zone |
| Rinse Times | `rinse-times` | Rinse duration for each zone |
| Switching | `switching` | Zone overlap and source-change delay |
| Flow Protection | `flow-protection` | Minimum/maximum flow, leak threshold and startup delay |
| System | `system` | Controller/network status, date/time, flow, total water, alarm |
| Water Consumption | `water-consumption` | Flow, current wash volume, per-zone litres, total litres |
| Manual Valve Control | `manual-valves` | Direct relay controls for CH1–CH8 |

The full custom type is `custom:solar-panel-washing-<suffix>-card`. Example:

```yaml
type: custom:solar-panel-washing-water-consumption-card
```

A configurable section card is also available:

```yaml
type: custom:solar-panel-washing-section-card
section: water-consumption
```

The complete card is `custom:solar-panel-washing-card`. A legacy standalone dashboard example is provided at [`home-assistant/modular-dashboard.yaml`](home-assistant/modular-dashboard.yaml), and a standard-card alternative at [`home-assistant/dashboard.yaml`](home-assistant/dashboard.yaml).

### Responsive layout and languages

Cards adapt to narrow phone screens. The language picker supports **Auto / English / Русский / עברית**; Auto follows the Home Assistant language when supported. Hebrew uses right-to-left layout. The language choice affects the UI, not the ESPHome control logic. Labels and explanatory text are translated; sensor IDs remain in their existing form.

## Washing sequence

1. Enable the desired zones and select **Water** or **Detergent + Water**.
2. Start manually or wait for a configured weekday/time.
3. The controller powers the valve supply and runs the selected program using the per-zone durations.
4. When switching zones, the next valve may open before the previous valve closes, for the configured overlap time.
5. In detergent mode, detergent and rinse phases use separate durations, with a configurable delay when changing water sources.
6. At completion, relays turn off. Emergency Stop interrupts the program and closes the outputs.

The ESP32 owns the execution and safety checks. The dashboard is not required to stay open. Do not treat manual valve operation as an automatic wash: it bypasses the programmed zone sequence.

## v1.3.27 flow safety and stage timers

Flow Check Delay now specifies how long an abnormal reading must persist continuously before triggering a fault. A fixed 3-second grace period follows the opening of a water or detergent source. Brief high-flow spikes during zone overlap reset the confirmation timer when flow returns to normal.

The firmware publishes Stage Kind (1 water, 2 detergent, 3 rinse, 4 final test), Stage Zone, Stage Seconds Remaining, Flow Violation Seconds, Flow Violation Kind, Fault Kind, Fault Zone, Fault Flow, and Fault Threshold. The existing Washing Control card displays the latched fault reason, while the existing Flow Protection card highlights the relevant threshold. The three duration cards show active stage countdowns. Reset Alarm clears the latched fault.

After the last zone finishes, the main source valve closes. The last zone remains open for 15 seconds of pressure release, followed by a continuous-flow verification lasting Flow Check Delay seconds. All zone valves close regardless of the verification result. If flow remains above the leak threshold for the entire verification period and Flow Protection is enabled, the controller latches Main Valve Not Closed. This is not a guarantee of zero leakage below the meter's reliable detection range.

**Commissioning:** Test the new firmware under supervision with Flow Protection disabled initially. Check the 3-second startup grace, zone transitions, Emergency Stop, and final valve closure. Only then enable protection and unattended scheduling. This update has not been hardware-tested on the target ESP32.

## Flow measurement, water accounting and graphs

| Reading | Entity ID | Behavior |
| --- | --- | --- |
| Flow | `sensor.solar_panel_washing_water_flow` | Instantaneous L/min, including manual valve operation |
| Total Water | `sensor.solar_panel_washing_total_water` | Accumulated litres, including manual flow |
| Current Wash Water | `sensor.solar_panel_washing_current_wash_water` | Litres during the current or most recent wash |
| Zone 1–5 Water | `sensor.solar_panel_washing_wash_zone_1_water` … `sensor.solar_panel_washing_wash_zone_5_water` | Litres attributed to each zone during that wash |

The five per-zone counters and the wash counter **reset on an accepted new wash**. They retain the last wash values after completion, and **are restored after ESP32 reboot from the most recent saved ESP32 flash checkpoint**. Manual flow outside a wash increases **Total Water**, not **Current Wash Water** or the zone counters.

During valve overlap, measured water is divided equally between simultaneously open zone valves. This is an **estimate** for individual zones because there is only one shared meter. Water passing during a wash while no zone valve is open contributes to the wash total but cannot be assigned to a zone.

Flow and litre values are **displayed to two decimal places**. Tap the readings in **System Status** or **Water Consumption** to open Home Assistant's native More Info history. History requires the HA **Recorder** integration to be enabled and not to exclude these entities. Data retention is governed by your Home Assistant Recorder configuration, not by ESP32.

### Actual elapsed timer values — v1.3.25

Each of the 15 editable duration settings in **Water Times**, **Detergent Times**, and **Rinse Times** now shows an additional read-only **Actual** value **inline next to its configured input** (localized into English, Russian or Hebrew), measured from the ESP32's elapsed milliseconds during that stage. During an active stage, the existing **Remaining** countdown also appears. After a normal completion or emergency stop, the actual values remain visible until the next accepted wash starts. **These 15 actual timer values are RAM-only** (`restore_value: no`), do not write to ESP32 flash or HA snapshot storage, and reset on ESP32 restart. Water-volume counter persistence introduced in v1.3.24 remains unchanged. Fifteen new ESPHome sensors named `sensor.solar_panel_washing_actual_<water|detergent|rinse>_zone_<1..5>_time` expose the values to Home Assistant.

The Water Consumption restore date/time picker stays open while Home Assistant updates live sensor states; the selected date/time is retained until the user loads history.\n\n## Water counter backup and restore — v1.3.24

All **seven counters** (Total Water, Current Wash Water and Zone 1–5 Water) now use restored ESPHome globals. The controller queues updates in RAM, but saves a flash checkpoint at **06:00 Asia/Jerusalem** every day after SNTP time synchronization. The **Save now** button in the Water Consumption card calls `button.solar_panel_washing_save_water_counters` to flush pending ESP32 preferences before OTA flashing. These checkpoints avoid frequent flash writes, but a power failure before the next save may lose unsaved readings.

The integration also stores a separate **daily Home Assistant backup at 06:00 HA local time**, using `homeassistant.helpers.storage.Store` in HA's `.storage` folder, independently of Recorder retention. Set **Settings → System → General → Time zone** to `Asia/Jerusalem` for matching schedules. The **Backup in HA** button creates an additional on-demand snapshot by calling `solar_panel_washing_dashboard.save_water_snapshot`.

The **Restore counters** button is the only always-visible action in the Water Consumption card; it expands the recovery panel. After the user confirms and Home Assistant accepts the restore service call, the recovery panel automatically collapses. The separate Save to ESP32 and Backup in HA services remain available through HA Developer Tools but their buttons are hidden from this card. Select any date and time (local time, to the minute), then **Load history**. The card queries the Home Assistant Recorder for all seven historical readings at or before that instant and displays each recorded timestamp and its value alongside the current value. If Recorder data has expired, it falls back to the latest stored daily HA snapshot **before** the requested time and clearly labels that fallback. No missing values are invented. Use **Confirm restore** to review a confirmation dialog and send all seven values to ESP32 using the ESPHome native API action `esphome.solar_panel_washing_restore_water_counters`.

**Safety:** the controller rejects restoration during washing, final valve checks, or whenever any relay is energized. Invalid or negative values are rejected. Restoring older total readings can cause a reset/discontinuity in HA long-term energy/water statistics because the total sensor uses `state_class: total_increasing`. The ESPHome action can reject unsafe requests without a synchronous success response; verify the displayed sensor values after restoration. Daily snapshots start only **after** installing this integration; they cannot recover earlier data that Recorder already deleted.

**Important for first upgrade from v1.3.23:** the five zone counters and current-wash counter were volatile in the older firmware. The first v1.3.27 flash cannot recover their previous in-RAM values by itself. Before flashing, use **Developer Tools → States** or screenshots to preserve all seven values. After flashing, use the new restoration panel to load them from HA Recorder history and apply them. Existing total water preference should remain available on normal OTA updates, but any unsaved part may be lost. Avoid erase-flash if you need to preserve ESP32 preferences.

## Retaining Total Water across reboot and firmware updates

The firmware keeps a persistent total in an ESPHome global and accumulates deltas from the raw hardware pulse counter. The preference write interval is:

```yaml
preferences:
  flash_write_interval: 24h
```

The controller now explicitly flushes preferences at **06:00** and on manual Save, while the 24-hour interval remains as a fallback. If time synchronization is unavailable at 06:00, that daily checkpoint is skipped. If power is lost or the device restarts before the pending value is saved, the unsaved part of the total may be lost. **The same global ESPHome preference interval also applies to other restored settings**, including configured durations, schedule modes and flow limits.

The current firmware has a **first-install initial value of 30.6237333 L**, taken from the meter reading when persistence was introduced. **Before the first firmware installation using this persistent counter, change `persistent_water_liters.initial_value` to your actual total if it has increased.** Once a saved value exists, that saved value takes precedence over `initial_value`. An erase-flash operation can delete persisted preferences. OTA does not intentionally erase them, but cannot guarantee that unsaved changes survive a restart.

## Safety and commissioning

- Confirm relay ratings, transformer supply, wiring, fusing, earthing and local electrical requirements before energizing valves.
- Test the source valves and all five zones one at a time.
- Verify the YF-B5 meter against a known water volume at a flow rate within its specified range.
- Set appropriate low/high-flow and leak thresholds; keep flow protection **off** until wiring and measurements are verified.
- Do not rely on a flow meter that undercounts below its rated minimum for detecting very small leaks.
- Manual CH1–CH8 controls are for testing and maintenance and may bypass normal automatic protections.
- Following reboot or power loss, the controller turns outputs off and does not automatically resume an interrupted wash.

## Screenshots

### Washing Control
![Washing controls](assets/screenshots/01-washing-control-clean.png)

### Schedule and Active Zones
![Schedule and zones](assets/screenshots/02-schedule-zones.png)

### Water Times
![Water durations](assets/screenshots/03-water-times.png)

### Detergent and Rinse
![Detergent and rinse durations](assets/screenshots/04-detergent-rinse-times.png)

### Switching and Flow Protection
![Switching and flow protection](assets/screenshots/05-switching-flow-protection.png)

### System and Manual Valves
![System status and manual valves](assets/screenshots/06-system-manual-valves.png)

> The screenshots are reference images and may not show the latest v1.3.27 Water Consumption card. The current interface and entities are documented above.

## Repository structure

```text
solar-panel-washing/
├── VERSION
├── README.md
├── LICENSE
├── hacs.json
├── solar-panel-washing.js
├── solar-panel-washing-card.js
├── custom_components/
│   └── solar_panel_washing_dashboard/
│       ├── manifest.json
│       ├── __init__.py
│       └── solar-panel-washing.js
├── esphome/
│   ├── solar-panel-washing.yaml
│   └── secrets.example.yaml
├── home-assistant/
│   ├── dashboard.yaml
│   └── modular-dashboard.yaml
└── assets/
    └── screenshots/
```

## Release history

| Version | Main changes |
| --- | --- |
| **1.3.27** | Simplified Water Consumption card to a single Restore Counters toggle; collapse recovery panel after successful restore service call |
| **1.3.26** | Display translated actual timer values inline next to configured seconds; prevent HA updates from closing the date/time picker in Water Consumption |
| **1.3.25** | Fifteen live actual elapsed timers (water, detergent, rinse × 5 zones), RAM only; remain visible after washing and reset on next wash/reboot |
| **1.3.24** | Daily 06:00 ESP32 flash checkpoint and durable HA snapshots; manual backup; date/time history preview and confirmed restoration of seven water counters |
| **1.3.23** | Flow fault confirmation, live stage countdowns, latched diagnostics, final valve pressure release and verification |
| **1.3.22** | Instantaneous Flow formatted to two decimals throughout the UI |
| **1.3.21** | Clickable Flow and Total Water in System Status open native HA history |
| **1.3.20** | Clickable history for water metrics, rounded litre display, persistent Total Water; firmware preference interval later set to 24h |
| **1.3.19** | Live Flow in System Status, including manual water flow |
| **1.3.18** | Water Consumption card, per-wash and per-zone water accounting |
| **1.3.17** | Washing-active indicator and mobile RTL menu improvements |
| **1.3.x** | Responsive dashboard, scheduling and system-status improvements |
| **1.1.x** | Modular independent Lovelace section cards |
| **1.0.0** | Initial five-zone ESPHome washing controller |

## Version consistency

For release **v1.3.27**, the following must agree:

- [`VERSION`](VERSION): `1.3.27`
- [Integration manifest](custom_components/solar_panel_washing_dashboard/manifest.json): `1.3.27`
- Frontend resource version in [`__init__.py`](custom_components/solar_panel_washing_dashboard/__init__.py): `v1.3.27`
- Frontend version labels in `solar-panel-washing.js`, `solar-panel-washing-card.js` and the bundled integration JavaScript: `v1.3.27`

These versions were checked against the repository files. They do **not** prove that a particular Home Assistant installation has already updated or that ESPHome firmware has been compiled on the target hardware.

## License

MIT — see [LICENSE](LICENSE).
