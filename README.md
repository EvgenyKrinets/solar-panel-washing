<div align="center">
  

# Solar Panel Washing

### Automatic multi-zone solar-panel washing with ESP32, ESPHome and Home Assistant

**Version 1.1.11**

[![ESPHome](https://img.shields.io/badge/ESPHome-2026.x-000000?logo=esphome)](https://esphome.io/)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Dashboard-18BCF2?logo=homeassistant&logoColor=white)](https://www.home-assistant.io/)
[License: MIT](LICENSE)

![Solar Panel Washing — Automated Cleaning System](assets/ChatGPT%20Image%20Oct%2011%2C%202026%2C%2009_53_43%20PM.png)

</div>

## Overview

Solar Panel Washing is a local-first automatic washing controller for rooftop photovoltaic arrays. The ESP32 runs the washing sequence and safety logic locally, while Home Assistant provides a clean interface for starting, stopping, scheduling and tuning the system.

The reference hardware is the **Waveshare ESP32-S3-ETH-8DI-8RO**. Eight relay channels control two source valves, five washing zones and the valve-transformer power supply.

## Highlights

- 💧 **Water mode** with configurable washing time for every zone.
- 🧴 **Detergent + Water mode** with separate detergent and rinse times.
- 🚿 **Five independent washing zones** that can be enabled or disabled individually.
- 🔄 **Zone overlap** opens the next zone before closing the previous one.
- 🛡️ **Flow protection** for low flow, high flow and unexpected flow/leak detection.
- 📅 **Local weekly scheduler** with selectable weekdays and start time.
- 🛑 **Emergency stop** and alarm reset.
- ⚡ **Transformer control** so valve power does not remain energized unnecessarily.
- 📱 **Responsive Home Assistant dashboard** for desktop and mobile.
- 🏠 The washing sequence continues locally on the ESP32 if Home Assistant disconnects.

## Relay map

| Relay | Function |
|---|---|
| CH1 | Filtered water source valve |
| CH2 | Detergent source valve |
| CH3 | Zone 1 |
| CH4 | Zone 2 |
| CH5 | Zone 3 |
| CH6 | Zone 4 |
| CH7 | Zone 5 |
| CH8 | Valve transformer power |

CH1 and CH2 use an ESPHome interlock and are not intended to be active simultaneously.

## Flow meter

The current configuration is prepared for a **YF-B5 G3/4** flow meter using **396 pulses/liter** on DI1 / GPIO4. Flow Protection is OFF by default so the controller can be installed and tested before the meter is connected.

> **Important:** verify the electrical output of your actual flow-meter unit and the Waveshare digital-input requirements before wiring its signal line.

## Installation

### Recommended: HACS Dashboard Card

The project now includes an installable Home Assistant frontend card. Add this repository to HACS as a **Dashboard** custom repository:

`https://github.com/EvgenyKrinets/solar-panel-washing`

Install **Solar Panel Washing Dashboard** (category **Dashboard**) and reload the Home Assistant frontend. HACS should register the JavaScript resource automatically. Then use **Edit dashboard → Add card → Solar Panel Washing**, or add one card manually:

```yaml
type: custom:solar-panel-washing-card
```

If the card is not listed after an update, use **Redownload** in HACS, then refresh Home Assistant. The expected resource path is `/hacsfiles/solar-panel-washing/solar-panel-washing.js` (do not register a duplicate resource if HACS has already created one).

The card automatically uses the standard `solar_panel_washing_...` entity IDs created by this project and provides the complete responsive interface in one card. Updates can then be delivered through HACS instead of copying the dashboard YAML again.

The classic all-standard-cards dashboard remains available in `home-assistant/dashboard.yaml`.

### 1. ESPHome

Copy `esphome/solar-panel-washing.yaml` to your ESPHome configuration directory.

Add the values from `esphome/secrets.example.yaml` to your own `secrets.yaml`. Keep your real Wi-Fi password and API encryption key private.

Validate, compile and install the configuration from ESPHome Device Builder.

### 2. Home Assistant

After Home Assistant discovers the ESPHome device, confirm that its entities are available.

Create a new dashboard in Home Assistant, open its raw YAML editor and paste the contents of:

`home-assistant/dashboard.yaml`

The supplied dashboard uses only standard Home Assistant cards—no third-party frontend card is required.

> Home Assistant normally preserves an entity's original `entity_id` when an ESPHome entity is renamed. If your controller was already installed before this project, compare the entity IDs in the dashboard YAML with your existing entities.

## Dashboard layout

The dashboard separates controls by purpose instead of putting everything into one long card:

- **Washing Control** — mode, status, START, Emergency Stop and alarm reset.
- **Automatic Schedule** — start time plus compact **M T W T F S S** day buttons.
- **Active Zones** — five compact zone buttons.
- **Water / Detergent / Rinse Times** — individual timing for every zone.
- **Switching Settings** — overlap and source-change delay.
- **Flow Protection** — live flow, limits, leak threshold and total water.
- **Manual Valve Control** — service/testing controls for CH1–CH8.
- **System Status** — controller, alarm, Wi-Fi, uptime and network information.

## Safety

This project controls real valves and may switch a transformer. Confirm relay contact ratings, valve voltage/current, transformer protection, wiring, earthing and local electrical requirements before connecting loads.

Manual CH1–CH8 entities intentionally remain available for commissioning and service. They can bypass the normal automatic sequence, so use the **Manual Valve Control** section carefully.

After power loss or ESP32 reboot, relay outputs are configured **ALWAYS_OFF** and a wash does not automatically resume.

## Files

```
solar-panel-washing/
├── VERSION
├── README.md
├── LICENSE
├── hacs.json
├── solar-panel-washing.js (HACS entrypoint)
├── solar-panel-washing-card.js (legacy)
├── assets/
│   ├── icon.svg
│   └── dashboard-preview.svg
├── esphome/
│   ├── solar-panel-washing.yaml
│   └── secrets.example.yaml
└── home-assistant/
    └── dashboard.yaml
```

## Version 1.1.0

- Added installable HACS Dashboard card
- Complete responsive UI is now available as one custom card
- Compact weekday and zone controls
- START, Emergency Stop and Reset controls
- Water, detergent and rinse timing controls
- Flow protection and manual valve controls
- HACS-based frontend updates

## Version 1.0.0

Initial public release:

- Waveshare ESP32-S3-ETH-8DI-8RO relay mapping
- Water and detergent/rinse programs
- Five selectable zones
- Weekly automatic scheduling
- Configurable timing and overlap
- YF-B5 flow-meter support
- Flow/leak protection
- Home Assistant desktop/mobile dashboard
- Project icon and dashboard artwork

## License

MIT License. See `LICENSE`.
