// RoboCode native-flash acceptance test for a classic 4 MB ESP32 board.
#include <Arduino.h>

constexpr uint8_t ROBOCODE_BUILT_IN_LED_PIN = 2;

void setup() {
  Serial.begin(115200);
  pinMode(ROBOCODE_BUILT_IN_LED_PIN, OUTPUT);
  Serial.println("RoboCode native flash test started.");
}

void loop() {
  digitalWrite(ROBOCODE_BUILT_IN_LED_PIN, HIGH);
  Serial.println("LED ON (GPIO 2)");
  delay(1000);
  digitalWrite(ROBOCODE_BUILT_IN_LED_PIN, LOW);
  Serial.println("LED OFF (GPIO 2)");
  delay(1000);
}
