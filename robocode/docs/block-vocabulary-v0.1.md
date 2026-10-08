# RoboCode block vocabulary v0.1

## Scope

Phase 1 intentionally supports only one repeating program and the board's built-in LED.

| Block | Meaning | Arduino output |
| --- | --- | --- |
| `START` | The program body that repeats forever. | Contents appear in `loop()`. |
| `set built-in LED ON/OFF` | Changes the board's built-in LED state. | `digitalWrite(ROBOCODE_BUILT_IN_LED_PIN, HIGH/LOW);` |
| `wait <milliseconds> milliseconds` | Pauses the program. | `delay(<milliseconds>);` |

## Generation contract

Every generated sketch that uses an LED block defines `ROBOCODE_BUILT_IN_LED_PIN` as GPIO 2, configures it in `setup()`, and runs the contents of the first `START` block in `loop()`. GPIO 2 is the Phase 1 baseline mapping for the existing 30-pin ESP32; a later hardware profile will make this configurable.

## Explicitly out of scope

- arbitrary GPIO pins
- sensors and actuators
- variables, conditions, or nested loops
- uploading from RoboCode
- Roblox simulation
