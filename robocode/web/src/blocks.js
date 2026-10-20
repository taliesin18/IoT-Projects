import * as Blockly from 'blockly';

let blocksDefined = false;

export function defineRoboCodeBlocks() {
  if (blocksDefined) return;

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: 'robocode_start',
      message0: 'START',
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: 210,
      tooltip: 'Everything inside START repeats in the Arduino loop.',
      helpUrl: '',
    },
    {
      type: 'robocode_set_gpio_output',
      message0: 'set GPIO %1 %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PIN',
          options: [
            ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
            ['21', '21'], ['22', '22'], ['23', '23'], ['25', '25'],
            ['26', '26'], ['27', '27'], ['32', '32'], ['33', '33'],
          ],
        },
        {
          type: 'field_dropdown',
          name: 'STATE',
          options: [['HIGH', 'HIGH'], ['LOW', 'LOW']],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 25,
      tooltip: 'Set a safe external-output pin on the classic ESP32 high or low.',
      helpUrl: '',
    },
    {
      type: 'robocode_servo_write',
      message0: 'move servo on GPIO %1 to %2 degrees',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PIN',
          options: [
            ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
            ['21', '21'], ['22', '22'], ['23', '23'], ['25', '25'],
            ['26', '26'], ['27', '27'],
          ],
        },
        { type: 'input_value', name: 'ANGLE', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 15,
      tooltip: 'Move a standard hobby servo from 0 to 180 degrees. Power the servo separately.',
      helpUrl: '',
    },
    {
      type: 'robocode_if',
      message0: 'if %1 then',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      message2: 'otherwise',
      message3: '%1',
      args3: [{ type: 'input_statement', name: 'ELSE' }],
      previousStatement: null,
      nextStatement: null,
      colour: 260,
      tooltip: 'Run one set of blocks when a condition is true, and another when it is false.',
      helpUrl: '',
    },
    {
      type: 'robocode_repeat',
      message0: 'repeat %1 times',
      args0: [{ type: 'input_value', name: 'COUNT', check: 'Number' }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: 260,
      tooltip: 'Repeat the blocks inside a chosen number of times.',
      helpUrl: '',
    },
    {
      type: 'robocode_logic_and',
      message0: 'both %1 and %2',
      args0: [
        { type: 'input_value', name: 'LEFT', check: 'Boolean' },
        { type: 'input_value', name: 'RIGHT', check: 'Boolean' },
      ],
      output: 'Boolean',
      colour: 260,
      tooltip: 'True only when both conditions are true.',
      helpUrl: '',
    },
    {
      type: 'robocode_logic_or',
      message0: 'either %1 or %2',
      args0: [
        { type: 'input_value', name: 'LEFT', check: 'Boolean' },
        { type: 'input_value', name: 'RIGHT', check: 'Boolean' },
      ],
      output: 'Boolean',
      colour: 260,
      tooltip: 'True when at least one condition is true.',
      helpUrl: '',
    },
    {
      type: 'robocode_logic_not',
      message0: 'not %1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      output: 'Boolean',
      colour: 260,
      tooltip: 'Reverses a condition: true becomes false, and false becomes true.',
      helpUrl: '',
    },
    {
      type: 'robocode_step_define',
      message0: 'make reusable step %1',
      args0: [{ type: 'field_input', name: 'NAME', text: 'my step' }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: 290,
      tooltip: 'Create named blocks you can run from START. Keep this helper outside START.',
      helpUrl: '',
    },
    {
      type: 'robocode_number',
      message0: 'number %1',
      args0: [{
        type: 'field_number',
        name: 'VALUE',
        value: 2,
        min: -1000000,
        max: 1000000,
        precision: 1,
      }],
      output: 'Number',
      colour: 230,
      tooltip: 'A whole number for a variable, repeat count, or serial output.',
      helpUrl: '',
    },
    {
      type: 'robocode_compare_numbers',
      message0: 'value %1 %2 %3',
      args0: [
        { type: 'input_value', name: 'LEFT', check: 'Number' },
        {
          type: 'field_dropdown',
          name: 'OPERATOR',
          options: [
            ['is less than', 'LT'],
            ['is less than or equal to', 'LTE'],
            ['is equal to', 'EQ'],
            ['is not equal to', 'NEQ'],
            ['is greater than or equal to', 'GTE'],
            ['is greater than', 'GT'],
          ],
        },
        { type: 'input_value', name: 'RIGHT', check: 'Number' },
      ],
      output: 'Boolean',
      colour: 260,
      tooltip: 'Compare two numbers, such as a measured distance and a limit.',
      helpUrl: '',
    },
    {
      type: 'robocode_variable_set',
      message0: 'set local %1 to %2',
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'item' },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 330,
      tooltip: 'Store a whole number for this RoboCode project.',
      helpUrl: '',
    },
    {
      type: 'robocode_variable_change',
      message0: 'change local %1 by %2',
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'item' },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 330,
      tooltip: 'Add or subtract a whole number from a local value.',
      helpUrl: '',
    },
    {
      type: 'robocode_variable_get',
      message0: 'local %1',
      args0: [{ type: 'field_variable', name: 'VAR', variable: 'item' }],
      output: 'Number',
      colour: 330,
      tooltip: 'Use the current value of a local variable.',
      helpUrl: '',
    },
    {
      type: 'robocode_button_pressed',
      message0: 'button on GPIO %1 is pressed',
      args0: [{
        type: 'field_dropdown',
        name: 'PIN',
        options: [
          ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
          ['21', '21'], ['22', '22'], ['23', '23'], ['25', '25'],
          ['26', '26'], ['27', '27'], ['32', '32'], ['33', '33'],
        ],
      }],
      output: 'Boolean',
      colour: 160,
      tooltip: 'True while a button wired between this GPIO pin and GND is pressed.',
      helpUrl: '',
    },
    {
      type: 'robocode_measure_ultrasonic',
      message0: 'measure ultrasonic SIG GPIO %1 into local %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PIN',
          options: [
            ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
            ['21', '21'], ['22', '22'], ['23', '23'], ['25', '25'],
            ['26', '26'], ['27', '27'], ['32', '32'], ['33', '33'],
          ],
        },
        { type: 'field_variable', name: 'VAR', variable: 'distance' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 45,
      tooltip: 'Measure a single-wire ultrasonic sensor. Stores whole centimeters, or -1 when it times out.',
      helpUrl: '',
    },
    {
      type: 'robocode_read_analog',
      message0: 'read analog input GPIO %1 into local %2',
      args0: [
        { type: 'field_dropdown', name: 'PIN', options: [['32', '32'], ['33', '33']] },
        { type: 'field_variable', name: 'VAR', variable: 'sensor value' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 45,
      tooltip: 'Read a 3.3V analog sensor into a local value from 0 to 4095.',
      helpUrl: '',
    },
    {
      type: 'robocode_read_light_sensor',
      message0: 'read light sensor GPIO %1 into local %2',
      args0: [
        { type: 'field_dropdown', name: 'PIN', options: [['32', '32'], ['33', '33']] },
        { type: 'field_variable', name: 'VAR', variable: 'brightness' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 45,
      tooltip: 'Read a photoresistor voltage divider into a local brightness value from 0 to 4095.',
      helpUrl: '',
    },
    {
      type: 'robocode_text',
      message0: 'text %1',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'Hello!' },
      ],
      output: 'Text',
      colour: 65,
      tooltip: 'Text for a RoboCode display. The LCD shows the first 16 characters on a row.',
      helpUrl: '',
    },
    {
      type: 'robocode_text_value',
      message0: 'text %1 value %2 ending %3',
      args0: [
        { type: 'field_input', name: 'PREFIX', text: 'Distance: ' },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
        { type: 'field_input', name: 'SUFFIX', text: ' cm' },
      ],
      output: 'Text',
      colour: 65,
      tooltip: 'Combine words with a number or local variable, such as Distance: 12 cm.',
      helpUrl: '',
    },
    {
      type: 'robocode_lcd_rows',
      message0: 'PCF8574 LCD 16x2 row 1 %1 row 2 %2',
      args0: [
        { type: 'input_value', name: 'ROW1', check: 'Text' },
        { type: 'input_value', name: 'ROW2', check: 'Text' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 65,
      tooltip: 'Write two 16-character rows on a PCF8574 I2C LCD. Its address and wiring map are detected automatically.',
      helpUrl: '',
    },
    {
      type: 'robocode_lcd_clear',
      message0: 'clear PCF8574 LCD 16x2',
      previousStatement: null,
      nextStatement: null,
      colour: 65,
      tooltip: 'Clear both rows of the detected PCF8574 I2C LCD.',
      helpUrl: '',
    },
    {
      type: 'robocode_i2c_scan',
      message0: 'scan I2C devices once',
      previousStatement: null,
      nextStatement: null,
      colour: 65,
      tooltip: 'Print each detected I2C address to Serial Monitor once after the ESP32 starts.',
      helpUrl: '',
    },
    {
      type: 'robocode_serial_print',
      message0: 'serial print line %1',
      args0: [{
        type: 'field_input',
        name: 'TEXT',
        text: 'Hello from RoboCode!',
      }],
      previousStatement: null,
      nextStatement: null,
      colour: 180,
      tooltip: 'Print a line to the Serial Monitor at 115200 baud.',
      helpUrl: '',
    },
    {
      type: 'robocode_serial_print_value',
      message0: 'serial print value %1',
      args0: [{ type: 'input_value', name: 'VALUE', check: 'Number' }],
      previousStatement: null,
      nextStatement: null,
      colour: 180,
      tooltip: 'Print a number or local variable to the Serial Monitor at 115200 baud.',
      helpUrl: '',
    },
    {
      type: 'robocode_wait_ms',
      message0: 'wait %1 milliseconds',
      args0: [{
        type: 'field_number',
        name: 'MILLISECONDS',
        value: 1000,
        min: 0,
        max: 60000,
        precision: 1,
      }],
      previousStatement: null,
      nextStatement: null,
      colour: 120,
      tooltip: 'Pause the program for a number of milliseconds.',
      helpUrl: '',
    },
  ]);

  Blockly.Blocks.robocode_step_call = {
    init() {
      const block = this;
      this.appendDummyInput()
        .appendField('run step')
        .appendField(new Blockly.FieldDropdown(() => {
          const definitions = block.workspace?.getTopBlocks(true)
            .filter((candidate) => candidate.type === 'robocode_step_define') || [];
          const choices = definitions.map((definition) => [
            String(definition.getFieldValue('NAME') || 'my step').trim() || 'my step',
            definition.id,
          ]);
          return choices.length ? choices : [['make a step first', '']];
        }), 'STEP');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(290);
      this.setTooltip('Run a reusable step that you made outside START.');
      this.setHelpUrl('');
    },
  };
  blocksDefined = true;
}

export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '⚡ Actions',
      colour: '#d97706',
      contents: [
        { kind: 'block', type: 'robocode_set_gpio_output' },
        {
          kind: 'block',
          type: 'robocode_servo_write',
          inputs: { ANGLE: { shadow: { type: 'robocode_number', fields: { VALUE: 90 } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: '🔁 Control',
      colour: '#805ad5',
      contents: [
        { kind: 'block', type: 'robocode_if' },
        {
          kind: 'block',
          type: 'robocode_compare_numbers',
          inputs: {
            LEFT: { shadow: { type: 'robocode_number', fields: { VALUE: 0 } } },
            RIGHT: { shadow: { type: 'robocode_number', fields: { VALUE: 10 } } },
          },
        },
        {
          kind: 'block',
          type: 'robocode_repeat',
          inputs: { COUNT: { shadow: { type: 'robocode_number', fields: { VALUE: 2 } } } },
        },
        { kind: 'block', type: 'robocode_logic_and' },
        { kind: 'block', type: 'robocode_logic_or' },
        { kind: 'block', type: 'robocode_logic_not' },
        { kind: 'block', type: 'robocode_wait_ms' },
        { kind: 'block', type: 'robocode_step_define' },
        { kind: 'block', type: 'robocode_step_call' },
      ],
    },
    {
      kind: 'category',
      name: '👀 Sensors',
      colour: '#b7791f',
      contents: [
        { kind: 'block', type: 'robocode_button_pressed' },
        { kind: 'block', type: 'robocode_measure_ultrasonic' },
        { kind: 'block', type: 'robocode_read_light_sensor' },
        { kind: 'block', type: 'robocode_read_analog' },
      ],
    },
    {
      kind: 'category',
      name: '🖥️ Screen',
      colour: '#718096',
      contents: [
        { kind: 'block', type: 'robocode_text' },
        {
          kind: 'block',
          type: 'robocode_text_value',
          inputs: { VALUE: { shadow: { type: 'robocode_number', fields: { VALUE: 0 } } } },
        },
        {
          kind: 'block',
          type: 'robocode_lcd_rows',
          inputs: {
            ROW1: { shadow: { type: 'robocode_text', fields: { TEXT: 'Hello!' } } },
            ROW2: { shadow: { type: 'robocode_text', fields: { TEXT: 'RoboCode' } } },
          },
        },
        { kind: 'block', type: 'robocode_lcd_clear' },
      ],
    },
    {
      kind: 'category',
      name: '📦 My Values',
      colour: '#805ad5',
      contents: [
        {
          kind: 'button',
          text: 'Create local variable…',
          callbackKey: 'CREATE_LOCAL_VARIABLE',
        },
        {
          kind: 'block',
          type: 'robocode_variable_set',
          inputs: { VALUE: { shadow: { type: 'robocode_number', fields: { VALUE: 0 } } } },
        },
        {
          kind: 'block',
          type: 'robocode_variable_change',
          inputs: { VALUE: { shadow: { type: 'robocode_number', fields: { VALUE: 1 } } } },
        },
        { kind: 'block', type: 'robocode_variable_get' },
        { kind: 'block', type: 'robocode_number' },
      ],
    },
    {
      kind: 'category',
      name: '🛠️ Debug',
      colour: '#2b6cb0',
      contents: [
        { kind: 'block', type: 'robocode_serial_print' },
        {
          kind: 'block',
          type: 'robocode_serial_print_value',
          inputs: { VALUE: { shadow: { type: 'robocode_number', fields: { VALUE: 0 } } } },
        },
        { kind: 'block', type: 'robocode_i2c_scan' },
      ],
    },
  ],
};
