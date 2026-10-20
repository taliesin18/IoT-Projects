#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>

hd44780_I2Cexp lcd;

void setup() {
  Wire.begin(21, 22);
  lcd.begin(16, 2);
  lcd.setCursor(0, 0);
  lcd.print("RoboCode LCD");
}

void loop() {
}
