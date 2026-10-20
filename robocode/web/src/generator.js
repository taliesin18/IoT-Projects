const INDENT = '  ';

function indent(lines) {
  return lines.map((line) => `${INDENT}${line}`);
}

function stringLiteral(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

function variableIdentifier(variable, usedIdentifiers) {
  const stem = String(variable.name || 'variable')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z_]/, '_') || 'variable';
  const base = `robocode_${stem}`;
  let identifier = base;
  let suffix = 2;
  while (usedIdentifiers.has(identifier)) {
    identifier = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIdentifiers.add(identifier);
  return identifier;
}

function createVariableNames(workspace) {
  const usedIdentifiers = new Set();
  const variables = workspace.getVariableMap?.().getAllVariables?.() || [];
  return new Map(variables.map((variable) => [
    variable.getId(),
    variableIdentifier(variable, usedIdentifiers),
  ]));
}

function stepFunctionIdentifier(label, usedIdentifiers) {
  const stem = String(label || 'step')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z_]/, '_') || 'step';
  const base = `robocodeStep_${stem}`;
  let identifier = base;
  let suffix = 2;
  while (usedIdentifiers.has(identifier)) {
    identifier = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIdentifiers.add(identifier);
  return identifier;
}

function createStepDefinitions(workspace) {
  const usedIdentifiers = new Set();
  const definitionBlocks = workspace.getTopBlocks(true)
    .filter((block) => block.type === 'robocode_step_define');
  const definitions = new Map(definitionBlocks.map((block) => {
    const label = String(block.getFieldValue('NAME') || 'my step').trim() || 'my step';
    return [block.id, { block, label, functionName: stepFunctionIdentifier(label, usedIdentifiers) }];
  }));
  definitions.forEach((definition) => {
    definition.calls = new Set((definition.block.getInputTargetBlock('DO')?.getDescendants(false) || [])
      .filter((block) => block.type === 'robocode_step_call')
      .map((block) => block.getFieldValue('STEP'))
      .filter((id) => definitions.has(id)));
  });
  return definitions;
}

function wouldCreateStepCycle(callerId, targetId, definitions, seen = new Set()) {
  if (callerId === targetId) return true;
  if (seen.has(targetId)) return false;
  seen.add(targetId);
  const target = definitions.get(targetId);
  return Boolean(target && [...target.calls]
    .some((nextTargetId) => wouldCreateStepCycle(callerId, nextTargetId, definitions, seen)));
}

function variableToCode(block, variableNames) {
  const variable = block.getField('VAR')?.getVariable();
  return variableNames.get(variable?.getId()) || '0';
}

function valueToCode(block, variableNames) {
  if (!block) return '0';
  if (block.type === 'robocode_number') {
    const value = Number(block.getFieldValue('VALUE'));
    return Number.isFinite(value) ? String(Math.trunc(value)) : '0';
  }
  if (block.type === 'robocode_variable_get') return variableToCode(block, variableNames);
  return '0';
}

function conditionToCode(block, variableNames) {
  if (block?.type === 'robocode_button_pressed') {
    const pin = Number(block.getFieldValue('PIN'));
    if (Number.isInteger(pin) && pin >= 0 && pin <= 33) {
      return `digitalRead(${pin}) == LOW`;
    }
  }

  if (block?.type === 'robocode_compare_numbers') {
    const operators = {
      LT: '<',
      LTE: '<=',
      EQ: '==',
      NEQ: '!=',
      GTE: '>=',
      GT: '>',
    };
    const operator = operators[block.getFieldValue('OPERATOR')];
    if (operator) {
      const left = valueToCode(block.getInputTargetBlock('LEFT'), variableNames);
      const right = valueToCode(block.getInputTargetBlock('RIGHT'), variableNames);
      return `${left} ${operator} ${right}`;
    }
  }

  if (block?.type === 'robocode_logic_and' || block?.type === 'robocode_logic_or') {
    const operator = block.type === 'robocode_logic_and' ? '&&' : '||';
    const left = conditionToCode(block.getInputTargetBlock('LEFT'), variableNames);
    const right = conditionToCode(block.getInputTargetBlock('RIGHT'), variableNames);
    return `(${left}) ${operator} (${right})`;
  }

  if (block?.type === 'robocode_logic_not') {
    return `!(${conditionToCode(block.getInputTargetBlock('CONDITION'), variableNames)})`;
  }

  return 'false';
}

function textToCode(block, variableNames) {
  if (!block) return 'String("")';
  if (block.type === 'robocode_text') {
    return `String("${stringLiteral(block.getFieldValue('TEXT'))}")`;
  }
  if (block.type === 'robocode_text_value') {
    const prefix = stringLiteral(block.getFieldValue('PREFIX'));
    const suffix = stringLiteral(block.getFieldValue('SUFFIX'));
    const value = valueToCode(block.getInputTargetBlock('VALUE'), variableNames);
    return `String("${prefix}") + String(${value}) + String("${suffix}")`;
  }
  return 'String("")';
}

function statementToLines(block, variableNames, stepDefinitions, currentStepId = null) {
  const lines = [];
  let current = block;

  while (current) {
    if (current.type === 'robocode_set_gpio_output') {
      const pin = Number(current.getFieldValue('PIN'));
      const state = current.getFieldValue('STATE') === 'LOW' ? 'LOW' : 'HIGH';
      if (Number.isInteger(pin) && pin >= 0 && pin <= 39) {
        lines.push(`digitalWrite(${pin}, ${state});`);
      }
    } else if (current.type === 'robocode_servo_write') {
      const pin = Number(current.getFieldValue('PIN'));
      if ([16, 17, 18, 19, 21, 22, 23, 25, 26, 27].includes(pin)) {
        lines.push(`robocodeServoWrite(${pin}, ${valueToCode(current.getInputTargetBlock('ANGLE'), variableNames)});`);
      }
    } else if (current.type === 'robocode_measure_ultrasonic') {
      const pin = Number(current.getFieldValue('PIN'));
      if (Number.isInteger(pin) && pin >= 0 && pin <= 33) {
        lines.push(`${variableToCode(current, variableNames)} = robocodeReadUltrasonicCm(${pin});`);
      }
    } else if (current.type === 'robocode_read_analog' || current.type === 'robocode_read_light_sensor') {
      const pin = Number(current.getFieldValue('PIN'));
      if ([32, 33].includes(pin)) {
        lines.push(`${variableToCode(current, variableNames)} = analogRead(${pin});`);
      }
    } else if (current.type === 'robocode_lcd_rows') {
      const row1 = textToCode(current.getInputTargetBlock('ROW1'), variableNames);
      const row2 = textToCode(current.getInputTargetBlock('ROW2'), variableNames);
      lines.push(`robocodeLcdWriteRows(${row1}, ${row2});`);
    } else if (current.type === 'robocode_lcd_clear') {
      lines.push('robocodeLcd.clear();');
    } else if (current.type === 'robocode_i2c_scan') {
      lines.push('robocodeScanI2cOnce();');
    } else if (current.type === 'robocode_if') {
      const condition = conditionToCode(current.getInputTargetBlock('CONDITION'), variableNames);
      const thenLines = statementToLines(current.getInputTargetBlock('DO'), variableNames, stepDefinitions, currentStepId);
      const elseLines = statementToLines(current.getInputTargetBlock('ELSE'), variableNames, stepDefinitions, currentStepId);
      lines.push(`if (${condition}) {`, ...indent(thenLines), '} else {', ...indent(elseLines), '}');
    } else if (current.type === 'robocode_repeat') {
      const count = valueToCode(current.getInputTargetBlock('COUNT'), variableNames);
      const repeatLines = statementToLines(current.getInputTargetBlock('DO'), variableNames, stepDefinitions, currentStepId);
      lines.push(
        `for (int robocodeRepeat = 0, robocodeRepeatLimit = ${count}; robocodeRepeat < robocodeRepeatLimit; ++robocodeRepeat) {`,
        ...indent(repeatLines),
        '}',
      );
    } else if (current.type === 'robocode_variable_set') {
      lines.push(`${variableToCode(current, variableNames)} = ${valueToCode(current.getInputTargetBlock('VALUE'), variableNames)};`);
    } else if (current.type === 'robocode_variable_change') {
      lines.push(`${variableToCode(current, variableNames)} += ${valueToCode(current.getInputTargetBlock('VALUE'), variableNames)};`);
    } else if (current.type === 'robocode_step_call') {
      const target = stepDefinitions.get(current.getFieldValue('STEP'));
      if (target && !wouldCreateStepCycle(currentStepId, target.block.id, stepDefinitions)) {
        lines.push(`${target.functionName}();`);
      }
    } else if (current.type === 'robocode_serial_print') {
      lines.push(`Serial.println("${stringLiteral(current.getFieldValue('TEXT'))}");`);
    } else if (current.type === 'robocode_serial_print_value') {
      lines.push(`Serial.println(${valueToCode(current.getInputTargetBlock('VALUE'), variableNames)});`);
    } else if (current.type === 'robocode_wait_ms') {
      const milliseconds = Number(current.getFieldValue('MILLISECONDS'));
      lines.push(`delay(${Number.isFinite(milliseconds) ? milliseconds : 0});`);
    }
    current = current.getNextBlock();
  }

  return lines;
}

export function generateArduinoCode(workspace) {
  const variableNames = createVariableNames(workspace);
  const stepDefinitions = createStepDefinitions(workspace);
  const start = workspace.getTopBlocks(true).find((block) => block.type === 'robocode_start');
  const body = start ? statementToLines(start.getInputTargetBlock('DO'), variableNames, stepDefinitions) : [];
  const stepBodies = [...stepDefinitions.values()].map((definition) => ({
    ...definition,
    lines: statementToLines(definition.block.getInputTargetBlock('DO'), variableNames, stepDefinitions, definition.block.id),
  }));
  const allLines = [...body, ...stepBodies.flatMap((definition) => definition.lines)];
  const usesSerial = allLines.some((line) => line.includes('Serial.'));
  const usesUltrasonic = allLines.some((line) => line.includes('robocodeReadUltrasonicCm('));
  const usesAnalog = allLines.some((line) => line.includes('analogRead('));
  const usesLcd = allLines.some((line) => line.includes('robocodeLcd'));
  const usesI2cScan = allLines.some((line) => line.includes('robocodeScanI2cOnce('));
  const usesI2c = usesLcd || usesI2cScan;
  const usesServo = allLines.some((line) => line.includes('robocodeServoWrite('));
  const servoPins = [...new Set(allLines
    .map((line) => /robocodeServoWrite\((\d+),/.exec(line)?.[1])
    .filter(Boolean))]
    .map(Number)
    .sort((first, second) => first - second);
  const outputPins = [...new Set(allLines
    .map((line) => /^\s*digitalWrite\((\d+),/.exec(line)?.[1])
    .filter(Boolean))]
    .map(Number)
    .sort((first, second) => first - second);
  const inputPins = [...new Set(allLines
    .flatMap((line) => [...line.matchAll(/digitalRead\((\d+)\)/g)].map((match) => match[1]))
    .filter(Boolean))]
    .map(Number)
    .sort((first, second) => first - second);
  const setupBody = [
    ...outputPins.map((pin) => `${INDENT}pinMode(${pin}, OUTPUT);`),
    ...inputPins.map((pin) => `${INDENT}pinMode(${pin}, INPUT_PULLUP);`),
    ...(usesAnalog ? [`${INDENT}analogReadResolution(12);`] : []),
    ...((usesSerial || usesI2cScan) ? [`${INDENT}Serial.begin(115200);`] : []),
  ];

  return [
    '// Generated by RoboCode Phase 1 — do not edit this file by hand.',
    '#include <Arduino.h>',
    ...(usesI2c ? ['#include <Wire.h>'] : []),
    ...(usesLcd ? ['#include <hd44780.h>', '#include <hd44780ioClass/hd44780_I2Cexp.h>'] : []),
    ...(usesServo ? ['#if __has_include(<esp_arduino_version.h>)', '#include <esp_arduino_version.h>', '#endif'] : []),
    ...(usesLcd ? ['', 'hd44780_I2Cexp robocodeLcd;'] : []),
    ...(variableNames.size ? ['', ...[...variableNames.values()].map((name) => `int ${name} = 0;`)] : []),
    ...(stepBodies.length ? ['', ...stepBodies.map(({ functionName }) => `void ${functionName}();`)] : []),
    ...(usesUltrasonic ? [
      '',
      'int robocodeReadUltrasonicCm(uint8_t signalPin) {',
      `${INDENT}pinMode(signalPin, OUTPUT);`,
      `${INDENT}digitalWrite(signalPin, LOW);`,
      `${INDENT}delayMicroseconds(2);`,
      `${INDENT}digitalWrite(signalPin, HIGH);`,
      `${INDENT}delayMicroseconds(10);`,
      `${INDENT}digitalWrite(signalPin, LOW);`,
      `${INDENT}pinMode(signalPin, INPUT);`,
      `${INDENT}const unsigned long duration = pulseIn(signalPin, HIGH, 30000UL);`,
      `${INDENT}if (duration == 0) return -1;`,
      `${INDENT}return static_cast<int>((duration * 343UL) / 20000UL);`,
      '}',
    ] : []),
    ...(usesLcd ? [
      '',
      'void robocodeLcdWriteLine(uint8_t row, const String& text) {',
      `${INDENT}robocodeLcd.setCursor(0, row);`,
      `${INDENT}for (uint8_t index = 0; index < 16; ++index) {`,
      `${INDENT}${INDENT}robocodeLcd.write(index < text.length() ? text[index] : ' ');`,
      `${INDENT}}`,
      '}',
      '',
      'void robocodeLcdWriteRows(const String& row1, const String& row2) {',
      `${INDENT}robocodeLcdWriteLine(0, row1);`,
      `${INDENT}robocodeLcdWriteLine(1, row2);`,
      '}',
    ] : []),
    ...(usesI2cScan ? [
      '',
      'void robocodeScanI2cOnce() {',
      `${INDENT}static bool alreadyScanned = false;`,
      `${INDENT}if (alreadyScanned) return;`,
      `${INDENT}alreadyScanned = true;`,
      `${INDENT}uint8_t deviceCount = 0;`,
      `${INDENT}Serial.println("I2C scan started.");`,
      `${INDENT}for (uint8_t address = 1; address < 127; ++address) {`,
      `${INDENT}${INDENT}Wire.beginTransmission(address);`,
      `${INDENT}${INDENT}if (Wire.endTransmission() == 0) {`,
      `${INDENT}${INDENT}${INDENT}Serial.print("I2C device: 0x");`,
      `${INDENT}${INDENT}${INDENT}if (address < 16) Serial.print("0");`,
      `${INDENT}${INDENT}${INDENT}Serial.println(address, HEX);`,
      `${INDENT}${INDENT}${INDENT}deviceCount += 1;`,
      `${INDENT}${INDENT}}`,
      `${INDENT}}`,
      `${INDENT}if (deviceCount == 0) Serial.println("No I2C devices found.");`,
      `${INDENT}Serial.println("I2C scan complete.");`,
      '}',
    ] : []),
    ...(usesServo ? [
      '',
      'void robocodeServoAttach(uint8_t pin) {',
      '#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3',
      `${INDENT}ledcAttach(pin, 50, 16);`,
      '#else',
      `${INDENT}const uint8_t channel = pin - 16;`,
      `${INDENT}ledcSetup(channel, 50, 16);`,
      `${INDENT}ledcAttachPin(pin, channel);`,
      '#endif',
      '}',
      '',
      'void robocodeServoWrite(uint8_t pin, int angle) {',
      `${INDENT}const int safeAngle = constrain(angle, 0, 180);`,
      `${INDENT}const uint32_t duty = 1638UL + (static_cast<uint32_t>(safeAngle) * 6554UL) / 180UL;`,
      '#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3',
      `${INDENT}ledcWrite(pin, duty);`,
      '#else',
      `${INDENT}ledcWrite(pin - 16, duty);`,
      '#endif',
      '}',
    ] : []),
    ...stepBodies.flatMap(({ label, functionName, lines }) => [
      '',
      `// Reusable step: ${stringLiteral(label)}`,
      `void ${functionName}() {`,
      ...indent(lines),
      '}',
    ]),
    '',
    'void setup() {',
    ...setupBody,
    ...(usesI2c ? [`${INDENT}Wire.begin(21, 22);`] : []),
    ...(usesLcd ? [`${INDENT}robocodeLcd.begin(16, 2);`, `${INDENT}robocodeLcd.clear();`] : []),
    ...servoPins.map((pin) => `${INDENT}robocodeServoAttach(${pin});`),
    '}',
    '',
    'void loop() {',
    ...indent(body),
    '}',
    '',
  ].join('\n');
}
