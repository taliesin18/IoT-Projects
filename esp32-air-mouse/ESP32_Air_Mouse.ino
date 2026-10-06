// ESP32 Air Mouse — ESP32 DevKit (30-pin)
// Direct I2C: MPU6050 + OLED share GPIO21 (SDA) and GPIO22 (SCL).

#include <Wire.h>
#include <BleMouse.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

constexpr uint8_t SDA_PIN = 21;
constexpr uint8_t SCL_PIN = 22;
constexpr uint8_t JOYSTICK_X_PIN = 34;
constexpr uint8_t JOYSTICK_Y_PIN = 35;
constexpr uint8_t FIRE_PIN = 25;
constexpr uint8_t ACTION_PIN = 26;
constexpr uint8_t BLE_LED_PIN = 27;
constexpr uint8_t SENSITIVITY_PIN = 32;

constexpr uint8_t OLED_ADDRESS = 0x3C;
constexpr int SCREEN_WIDTH = 128;
constexpr int SCREEN_HEIGHT = 64;
constexpr float MOTION_GAIN = 4.0f;
constexpr float MOTION_DEADBAND = 0.05f;
constexpr uint16_t LOOP_DELAY_MS = 12;

BleMouse bleMouse("ESP32 Air Mouse", "ESP32", 100);
Adafruit_MPU6050 mpu;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

bool lastFirePressed = false;
bool lastActionPressed = false;
uint32_t lastDisplayUpdate = 0;

void failHard(const __FlashStringHelper *message) {
  Serial.println(message);
  while (true) {
    digitalWrite(BLE_LED_PIN, !digitalRead(BLE_LED_PIN));
    delay(250);
  }
}

void drawStatus(float sensitivity) {
  if (millis() - lastDisplayUpdate < 250) return;
  lastDisplayUpdate = millis();

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(F("ESP32 Air Mouse"));
  display.print(F("BLE: "));
  display.println(bleMouse.isConnected() ? F("connected") : F("waiting"));
  display.print(F("Sensitivity: "));
  display.println(sensitivity, 2);
  display.display();
}

void updateButton(uint8_t pin, bool &wasPressed, uint8_t mouseButton) {
  const bool isPressed = digitalRead(pin) == LOW;
  if (!bleMouse.isConnected() || isPressed == wasPressed) {
    wasPressed = isPressed;
    return;
  }
  if (isPressed) bleMouse.press(mouseButton);
  else bleMouse.release(mouseButton);
  wasPressed = isPressed;
}

void setup() {
  Serial.begin(115200);
  pinMode(FIRE_PIN, INPUT_PULLUP);
  pinMode(ACTION_PIN, INPUT_PULLUP);
  pinMode(BLE_LED_PIN, OUTPUT);
  digitalWrite(BLE_LED_PIN, LOW);

  // Keep a single, explicit I2C controller for both modules.
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  if (!mpu.begin(0x68, &Wire)) failHard(F("MPU6050 not found"));
  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    failHard(F("OLED not found; check 0x3C/0x3D"));
  }
  display.clearDisplay();
  display.display();

  bleMouse.begin();
}

void loop() {
  const bool connected = bleMouse.isConnected();
  digitalWrite(BLE_LED_PIN, connected ? HIGH : LOW);

  // Potentiometer determines a 0.25x–1.50x multiplier.
  const float sensitivity = 0.25f + (analogRead(SENSITIVITY_PIN) / 4095.0f) * 1.25f;
  drawStatus(sensitivity);

  updateButton(FIRE_PIN, lastFirePressed, MOUSE_LEFT);
  updateButton(ACTION_PIN, lastActionPressed, MOUSE_RIGHT);

  if (connected) {
    sensors_event_t accel, gyro, temp;
    mpu.getEvent(&accel, &gyro, &temp);

    // Gyro values are radians/s. Map pitch/yaw-rate into relative mouse motion.
    const float dx = gyro.gyro.z * MOTION_GAIN * sensitivity;
    const float dy = gyro.gyro.x * MOTION_GAIN * sensitivity;
    if (fabsf(dx) > MOTION_DEADBAND || fabsf(dy) > MOTION_DEADBAND) {
      bleMouse.move(static_cast<int8_t>(dx), static_cast<int8_t>(dy));
    }

    // Optional joystick data is read here to confirm the wired analog channels.
    // Map its behavior only after deciding the intended UI (cursor, scrolling, etc.).
    (void)analogRead(JOYSTICK_X_PIN);
    (void)analogRead(JOYSTICK_Y_PIN);
  }

  delay(LOOP_DELAY_MS);
}
