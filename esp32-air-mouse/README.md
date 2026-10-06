# ESP32 Air Mouse

A reproducible starting point for an **ESP32 DevKit (30-pin)** BLE air mouse prototype. The project preserves a direct, shared-I²C design: GPIO21 is SDA and GPIO22 is SCL for both the MPU6050/GY-521 and the 0.96-inch OLED.

![Air Mouse wiring schematic](hardware/schematic/esp32-air-mouse-schematic.svg)

> Status: the wiring in this repository matches the validated breadboard pin map supplied with this project. The firmware is a documented starter implementation; tune motion constants and button behavior on the physical prototype before treating it as production firmware.

## Repository layout

```text
firmware/ESP32_Air_Mouse/       Arduino sketch
hardware/schematic/             Rendered schematic and editable source
docs/                           Wiring table, bring-up, and prototype journal
assets/                         Reserved for breadboard/prototype photos
```

## Hardware

| Part | ESP32 DevKit pin | Notes |
| --- | --- | --- |
| MPU6050 / GY-521 SDA | GPIO21 | Shared I²C bus |
| MPU6050 / GY-521 SCL | GPIO22 | Shared I²C bus |
| OLED SDA | GPIO21 | Same I²C bus |
| OLED SCL | GPIO22 | Same I²C bus |
| Joystick VRx | GPIO34 | ADC input only |
| Joystick VRy | GPIO35 | ADC input only |
| FIRE button | GPIO25 → switch → GND | `INPUT_PULLUP` |
| ACTION button | GPIO26 → switch → GND | `INPUT_PULLUP` |
| BLE status LED | GPIO27 → 220–330 Ω → LED → GND | GPIO HIGH lights LED |
| Sensitivity potentiometer wiper | GPIO32 | Outer terminals to 3V3 and GND |

All modules share **3V3** and **GND**. This assumes a 3.3 V-compatible OLED and GY-521 board. Do not apply 5 V to ESP32 GPIO, OLED logic, or the MPU6050 supply for this design.

## Firmware setup

1. In Arduino IDE, install the ESP32 board package and select **ESP32 Dev Module**.
2. Install these libraries through Library Manager:
   - `ESP32 BLE Mouse` by T-vK (or the maintained compatible fork used by your setup)
   - `Adafruit MPU6050`
   - `Adafruit Unified Sensor`
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
3. Open `firmware/ESP32_Air_Mouse/ESP32_Air_Mouse.ino`, select the correct serial port, and upload.
4. Pair the device named **ESP32 Air Mouse** using the computer's Bluetooth settings.

The sketch calls `Wire.begin(21, 22)` once and passes that same `Wire` bus to both I²C devices. Keep this direct-I²C pattern if the code is extended.

## Schematic artifacts

- [`hardware/schematic/esp32-air-mouse-schematic.svg`](hardware/schematic/esp32-air-mouse-schematic.svg) — rendered, reviewable image.
- [`hardware/schematic/esp32-air-mouse-wiring.drawio`](hardware/schematic/esp32-air-mouse-wiring.drawio) — editable source. Open it in [diagrams.net](https://app.diagrams.net/) and export PDF/PNG when needed.

The drawing deliberately uses named module blocks and labelled nets rather than pretending a development board or breakout module is a custom PCB symbol. Before making a PCB, replace the blocks with the exact footprints/pinouts of the selected ESP32 board, OLED, GY-521, joystick, switches, LED, and potentiometer.

## Reproducing the prototype

Start with [the wiring checklist](docs/WIRING.md), then follow [bring-up](docs/BRING_UP.md). Record changes and evidence in [the prototyping journal](docs/PROTOTYPING_JOURNEY.md).

## License

MIT; see [LICENSE](LICENSE).
