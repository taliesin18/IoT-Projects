# RoboCode block vocabulary v0.1

## Scope

Phase 1 intentionally supports only one repeating program and the board's built-in LED.

| Block | Meaning | Arduino output |
| --- | --- | --- |
| `START` | The program body that repeats forever. | Contents appear in `loop()`. |
| `set built-in LED ON/OFF` | Changes the board's built-in LED state. | `digitalWrite(LED_BUILTIN, HIGH/LOW);` |
| `wait <milliseconds> milliseconds` | Pauses the program. | `delay(<milliseconds>);` |

## Generation contract

Every generated sketch configures `LED_BUILTIN` in `setup()` and runs the contents of the first `START` block in `loop()`.

## Explicitly out of scope

- arbitrary GPIO pins
- sensors and actuators
- variables, conditions, or nested loops
- uploading from RoboCode
- Roblox simulation
