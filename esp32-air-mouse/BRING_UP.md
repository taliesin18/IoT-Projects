# Bring-up procedure

1. With power disconnected, compare every wire to [`WIRING.md`](WIRING.md).
2. Check that no module VCC pin is connected to ESP32 `VIN`/5V.
3. Upload the sketch with the OLED and MPU6050 connected.
4. Open Serial Monitor at 115200 baud. The sketch reports an I²C initialization failure if either device cannot be reached.
5. Pair `ESP32 Air Mouse`. The GPIO27 LED turns on while a BLE host is connected.
6. Leave the device still for several seconds after boot, then move it gently. Adjust the sensitivity potentiometer and tune `MOTION_GAIN` if required.
7. Confirm FIRE and ACTION both pull their GPIO low when pressed; the sketch maps them to left and right mouse buttons by default.

## Troubleshooting

- **No OLED / MPU6050 detected:** confirm shared ground, SDA on GPIO21, SCL on GPIO22, and the module I²C address.
- **GPIO34/35 read strangely:** these pins are input-only and do not have internal pull-ups. They are correct for joystick analog outputs but should not be used for buttons.
- **BLE pairs but pointer does not move:** ensure the sensor is still at start-up and temporarily lower `MOTION_DEADBAND` in the sketch for testing.
- **Pointer drifts:** increase `MOTION_DEADBAND`, lower `MOTION_GAIN`, and avoid mechanical vibration.
