# IoT Projects

> A hands-on collection of connected-device experiments, prototypes, and practical builds.

Welcome! This repository is my growing workshop for Internet of Things projects across gaming, agriculture, home automation, homelab, and more. Each project lives in its own folder with the code, wiring assets, notes, and lessons that made it work.

## Project directory

| Project | What it is | Highlights | Status |
| --- | --- | --- | --- |
| [ESP32 Air Mouse](./esp32-air-mouse/) | A Bluetooth air-mouse controller built around an ESP32 DevKit, MPU6050 motion sensor, OLED display, joystick, buttons, LED, and sensitivity control. | Firmware, latest EasyEDA schematic export, editable wiring diagram, setup notes | Active prototype |
| [RoboCode](./robocode/) | A Blockly-based programming prototype for ESP32 projects. | Arduino code generation and Android tooling | Prototype |
| [WhiteSheep AI](./whitesheep-ai/) | A local AI workspace for ideas, coding assistance, and visual projects. | Ollama chat, IdeaLab, read-only CodeLab, VideoLab and optional local image generation | Early prototype |

## Explore a project

### [ESP32 Air Mouse](./esp32-air-mouse/)

Use hand motion and physical controls to drive a BLE mouse. The project package includes:

- [Arduino firmware](./esp32-air-mouse/ESP32_Air_Mouse.ino)
- [Latest EasyEDA schematic](./esp32-air-mouse/Schematic_ESP32-Air-Mouse_2026-10-06.svg)
- [Editable wiring diagram](./esp32-air-mouse/esp32-air-mouse-wiring.drawio)
- [Wiring reference](./esp32-air-mouse/WIRING.md)
- [Bring-up guide](./esp32-air-mouse/BRING_UP.md)
- [Prototyping journey](./esp32-air-mouse/PROTOTYPING_JOURNEY.md)

### [WhiteSheep AI](./whitesheep-ai/)

WhiteSheep is a local-first assistant with saved conversations and IdeaLab projects, read-only coding tools, and VideoLab assets. Its optional Stable Diffusion worker generates images locally. Video and Blender rendering currently require the original local VideoStudio images and voice; see the [WhiteSheep setup guide](./whitesheep-ai/README.md) for requirements and limitations.

## How this repository is organized

`main` is the stable project library. New work begins on a short-lived branch such as `feat/project-name`; after testing and documentation are complete, it is reviewed and merged back into `main`.

```text
IoT-Projects/
├── esp32-air-mouse/        # ESP32 BLE controller
├── robocode/               # ESP32 block programming
└── whitesheep-ai/          # Local AI workspace
```

## Follow the build

Every project is documented as it evolves—from first wiring and experiments to the final working prototype. Browse the folders, learn from the notes, and reuse anything that helps with your own build.

---

*Built one prototype at a time.*
