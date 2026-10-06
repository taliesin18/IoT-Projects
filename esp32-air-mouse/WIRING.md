# Wiring checklist

## Power

Create one 3.3 V rail from the ESP32 DevKit `3V3` pin and one shared ground rail from an ESP32 `GND` pin.

| Module | Connect to 3V3 | Connect to GND |
| --- | --- | --- |
| MPU6050 / GY-521 | VCC | GND |
| 0.96-inch I²C OLED | VCC | GND |
| Joystick | VCC | GND |
| Sensitivity potentiometer | one outer terminal | other outer terminal |

## Signals

| Signal | From | To |
| --- | --- | --- |
| I²C data | MPU6050 SDA and OLED SDA | ESP32 GPIO21 |
| I²C clock | MPU6050 SCL and OLED SCL | ESP32 GPIO22 |
| Joystick X | joystick VRx | ESP32 GPIO34 |
| Joystick Y | joystick VRy | ESP32 GPIO35 |
| Sensitivity | potentiometer wiper | ESP32 GPIO32 |
| FIRE | one side of momentary switch | ESP32 GPIO25 |
| FIRE return | other side of momentary switch | GND |
| ACTION | one side of momentary switch | ESP32 GPIO26 |
| ACTION return | other side of momentary switch | GND |
| BLE LED drive | ESP32 GPIO27 | 220–330 Ω resistor, then LED anode |
| BLE LED return | LED cathode | GND |

The buttons have no external pull-up resistor: the firmware configures GPIO25 and GPIO26 as `INPUT_PULLUP`, so an unpressed input reads HIGH and a pressed input reads LOW.

## I²C notes

- Expected MPU6050 address: `0x68` (AD0 grounded).
- Expected OLED address: commonly `0x3C`; some boards use `0x3D`.
- Many breakouts include I²C pull-up resistors. Two small breakout boards on one short bus are normally fine. If adding several more I²C boards or using long wires, check the combined pull-up value and signal integrity.
