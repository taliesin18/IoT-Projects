# IoT Projects

> A hands-on collection of connected-device experiments, prototypes, and practical builds.

Welcome! This repository is my growing workshop for Internet of Things projects across gaming, agriculture, home automation, homelab, and more. Each project lives in its own folder with the code, wiring assets, notes, and lessons that made it work.

## Project directory

| Project | What it is | Highlights | Status |
| --- | --- | --- | --- |
| [ESP32 Air Mouse](./esp32-air-mouse/) | A Bluetooth air-mouse controller built around an ESP32 DevKit, MPU6050 motion sensor, OLED display, joystick, buttons, LED, and sensitivity control. | Firmware, latest EasyEDA schematic export, editable wiring diagram, setup notes | Active prototype |

## Explore a project

### [ESP32 Air Mouse](./esp32-air-mouse/)

Use hand motion and physical controls to drive a BLE mouse. The project package includes:

- [Arduino firmware](./esp32-air-mouse/ESP32_Air_Mouse.ino)
- [Latest EasyEDA schematic](./esp32-air-mouse/Schematic_ESP32-Air-Mouse_2026-10-06.svg)
- [Editable wiring diagram](./esp32-air-mouse/esp32-air-mouse-wiring.drawio)
- [Wiring reference](./esp32-air-mouse/WIRING.md)
- [Bring-up guide](./esp32-air-mouse/BRING_UP.md)
- [Prototyping journey](./esp32-air-mouse/PROTOTYPING_JOURNEY.md)

## How this repository is organized

`main` is the stable project library. New work begins on a short-lived branch such as `feat/project-name`; after testing and documentation are complete, it is reviewed and merged back into `main`.

```text
IoT-Projects/
├── esp32-air-mouse/        # Current project
└── future-project-name/    # Future builds
```

## Follow the build

Every project is documented as it evolves—from first wiring and experiments to the final working prototype. Browse the folders, learn from the notes, and reuse anything that helps with your own build.

---

*Built one prototype at a time.*
