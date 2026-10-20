# RoboCode native flash test firmware

This is a deliberately small acceptance-test firmware for the first RoboCode Android OTG flasher. It targets the classic 4 MB ESP32 profile (`esp32:esp32:esp32`), toggles GPIO 2, and writes a line to the 115200 baud serial monitor every second.

The matching bootloader, partition table, OTA selector, and application binaries are bundled into the RoboCode Android APK. Keep this source beside those assets so the built-in test can be reproduced and rebuilt.
