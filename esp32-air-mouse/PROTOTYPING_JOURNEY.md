# Prototyping journey

This file is intentionally a living engineering record. Add dated photos, measurements, and changes as the breadboard evolves.

## Baseline — 2026-10-06

- Controller: ESP32 DevKit, 30-pin.
- Motion sensor: MPU6050 / GY-521 using a direct shared I²C bus on GPIO21 (SDA) and GPIO22 (SCL).
- Display: 0.96-inch I²C OLED on that same bus.
- Controls: joystick on GPIO34/GPIO35; two active-low buttons on GPIO25/GPIO26.
- User feedback: GPIO27 BLE status LED with a 220–330 Ω series resistor.
- Adjustment: sensitivity potentiometer wiper on GPIO32.
- Design decision: preserve direct `Wire` initialization; do not introduce multiplexers or alternative bus layers unless the prototype establishes a need.

## Suggested evidence to add

1. A photo of the working breadboard from above.
2. A photo showing the ESP32 pin labels and I²C connections.
3. Firmware revision/hash that was verified on hardware.
4. Measured battery or USB supply voltage and expected operating duration, if power is later changed.
5. Notes on motion gain, deadband, and BLE pairing behavior.

## Next hardware iteration

Before designing a PCB, choose exact part numbers and mechanical dimensions. In particular, confirm whether the OLED and GY-521 breakout boards will remain as plug-in modules or be replaced by bare components. That decision determines the correct schematic symbols, footprints, and power circuitry.
