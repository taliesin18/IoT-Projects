import * as Blockly from 'blockly';
import './style.css';
import { defineRoboCodeBlocks, toolbox } from './blocks.js';
import { generateArduinoCode } from './generator.js';
import { createProject, loadProject } from './project.js';
import { flashFirmware } from './esp-flash.js';
import {
  addSerialListener,
  closeSerial,
  isNativeRoboCodeApp,
  listUsbDevices,
  openSerial,
  requestUsbPermission,
} from './usb.js';

defineRoboCodeBlocks();

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <div>
      <p class="eyebrow">ROBOCODE · PHASE 1</p>
      <h1>Blockly to Arduino</h1>
      <p class="subtitle">Build a looping LED program, then inspect the ESP32 sketch it creates.</p>
    </div>
    <div class="status"><span></span> Generator ready</div>
  </header>
  <main class="app-main">
    <div class="app-tabs" role="tablist" aria-label="RoboCode work areas">
      <button id="build-tab" class="tab-button" role="tab" aria-controls="build-panel" aria-selected="true" type="button">Build</button>
      <button id="hardware-tab" class="tab-button" role="tab" aria-controls="hardware-panel" aria-selected="false" type="button">Hardware</button>
    </div>
    <div id="build-panel" class="tab-panel build-layout" role="tabpanel" aria-labelledby="build-tab">
      <section class="workspace-panel" aria-labelledby="workspace-heading">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">1. BUILD</p>
            <h2 id="workspace-heading">Program blocks</h2>
          </div>
          <div class="panel-actions">
            <button id="load-blink" class="secondary" type="button">Load Blink example</button>
            <button id="save-project" class="secondary" type="button">Save project</button>
            <button id="load-project" class="secondary" type="button">Load project</button>
            <input id="project-file" type="file" accept="application/json,.json" hidden>
          </div>
        </div>
        <div id="blockly-div" aria-label="Blockly programming workspace"></div>
        <p class="hint">Use one <strong>START</strong> block. Its contents repeat inside Arduino <code>loop()</code>.</p>
        <p id="project-status" class="hint project-status" aria-live="polite">Projects are saved locally as RoboCode JSON files.</p>
      </section>
      <section class="code-panel" aria-labelledby="code-heading">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">2. REVIEW</p>
            <h2 id="code-heading">Generated Arduino sketch</h2>
          </div>
          <button id="toggle-sketch" class="secondary" aria-controls="sketch-content" aria-expanded="false" type="button">Show sketch</button>
        </div>
        <div id="sketch-content" hidden>
          <div class="code-actions">
            <button id="download-code" type="button">Download .ino</button>
            <button id="copy-code" class="secondary" type="button">Copy code</button>
          </div>
          <pre><code id="generated-code"></code></pre>
          <p id="copy-status" class="hint" aria-live="polite">The sketch is generated locally from your blocks.</p>
        </div>
      </section>
    </div>
    <div id="hardware-panel" class="tab-panel hardware-layout" role="tabpanel" aria-labelledby="hardware-tab" hidden>
      <section class="usb-panel" aria-labelledby="usb-heading">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">CONNECT · ANDROID BETA</p>
            <h2 id="usb-heading">ESP32 USB connection</h2>
          </div>
          <button id="check-usb" type="button">Check ESP32</button>
        </div>
        <p id="usb-status" class="hint" aria-live="polite"></p>
        <ul id="usb-devices" class="usb-devices" aria-live="polite"></ul>
        <div class="serial-monitor">
          <div class="serial-controls">
            <label for="serial-baud">Serial Monitor</label>
            <select id="serial-baud" disabled>
              <option value="115200">115200 baud</option>
              <option value="9600">9600 baud</option>
            </select>
            <button id="open-serial" type="button" disabled>Open monitor</button>
            <button id="close-serial" class="secondary" type="button" disabled>Disconnect</button>
            <button id="clear-serial" class="secondary" type="button">Clear</button>
          </div>
          <pre id="serial-output" aria-live="polite">Select an ESP32 USB adapter to open the Serial Monitor.</pre>
        </div>
        <div class="flash-panel">
          <div class="flash-heading">
            <div>
              <p class="eyebrow">EXPERIMENTAL · PHONE-ONLY</p>
              <h3>Flash an ESP32 app binary</h3>
            </div>
          </div>
          <p class="hint">The built-in test writes a complete matching classic-ESP32 firmware bundle. Or choose an ESP32 <code>.bin</code> application compiled for this board; RoboCode writes an app file at <code>0x10000</code>.</p>
          <div class="flash-controls">
            <button id="flash-blink-test" class="secondary" type="button" disabled>Flash RoboCode Blink test</button>
            <input id="app-binary" type="file" accept=".bin,application/octet-stream">
            <button id="flash-app" type="button" disabled>Flash app .bin</button>
          </div>
          <progress id="flash-progress" max="100" value="0" hidden></progress>
          <pre id="flash-output" aria-live="polite">Choose an ESP32 USB adapter, then choose a compiled app binary.</pre>
        </div>
      </section>
    </div>
  </main>
`;

const workspace = Blockly.inject('blockly-div', {
  toolbox,
  grid: { spacing: 20, length: 3, colour: '#dce7ed', snap: true },
  trashcan: true,
  zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 1.3, minScale: 0.6 },
  move: { scrollbars: true, drag: true, wheel: true },
  theme: Blockly.Themes.Classic,
});

const codeElement = document.querySelector('#generated-code');
const copyStatus = document.querySelector('#copy-status');
const projectStatus = document.querySelector('#project-status');
const projectFileInput = document.querySelector('#project-file');
const usbStatus = document.querySelector('#usb-status');
const usbDevices = document.querySelector('#usb-devices');
const checkUsbButton = document.querySelector('#check-usb');
const buildTab = document.querySelector('#build-tab');
const hardwareTab = document.querySelector('#hardware-tab');
const buildPanel = document.querySelector('#build-panel');
const hardwarePanel = document.querySelector('#hardware-panel');
const toggleSketchButton = document.querySelector('#toggle-sketch');
const sketchContent = document.querySelector('#sketch-content');
const serialBaud = document.querySelector('#serial-baud');
const openSerialButton = document.querySelector('#open-serial');
const closeSerialButton = document.querySelector('#close-serial');
const clearSerialButton = document.querySelector('#clear-serial');
const serialOutput = document.querySelector('#serial-output');
const appBinaryInput = document.querySelector('#app-binary');
const flashAppButton = document.querySelector('#flash-app');
const flashBlinkTestButton = document.querySelector('#flash-blink-test');
const flashProgress = document.querySelector('#flash-progress');
const flashOutput = document.querySelector('#flash-output');
let selectedUsbDevice = null;
let serialListenerHandles = [];

function updateGeneratedCode() {
  codeElement.textContent = generateArduinoCode(workspace);
}

function downloadFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = url;
  download.download = filename;
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setActiveTab(tabName) {
  const showBuild = tabName === 'build';
  buildTab.setAttribute('aria-selected', String(showBuild));
  hardwareTab.setAttribute('aria-selected', String(!showBuild));
  buildPanel.hidden = !showBuild;
  hardwarePanel.hidden = showBuild;
  if (showBuild) Blockly.svgResize(workspace);
}

function setSketchExpanded(expanded) {
  sketchContent.hidden = !expanded;
  toggleSketchButton.setAttribute('aria-expanded', String(expanded));
  toggleSketchButton.textContent = expanded ? 'Hide sketch' : 'Show sketch';
}

function appendSerialOutput(text) {
  serialOutput.textContent += text;
  if (serialOutput.textContent.length > 16000) {
    serialOutput.textContent = serialOutput.textContent.slice(-16000);
  }
  serialOutput.scrollTop = serialOutput.scrollHeight;
}

function appendFlashOutput(text) {
  flashOutput.textContent += text;
  if (flashOutput.textContent.length > 12000) {
    flashOutput.textContent = flashOutput.textContent.slice(-12000);
  }
  flashOutput.scrollTop = flashOutput.scrollHeight;
}

function updateFlashButton() {
  flashAppButton.disabled = !selectedUsbDevice || appBinaryInput.files.length === 0;
  flashBlinkTestButton.disabled = !selectedUsbDevice;
}

function selectUsbDevice(device) {
  selectedUsbDevice = device;
  serialBaud.disabled = false;
  openSerialButton.disabled = false;
  updateFlashButton();
  usbStatus.textContent = `USB access ready for ${device.driver}. Open the Serial Monitor at 115200 baud.`;
}

function showUsbDevice(device) {
  const item = document.createElement('li');
  const details = document.createElement('span');
  const name = [device.manufacturer, device.product].filter(Boolean).join(' ');
  details.textContent = `${name || 'Supported USB serial device'} · ${device.driver} · ${device.vendorId}:${device.productId}`;
  item.append(details);

  const permissionButton = document.createElement('button');
  permissionButton.className = 'secondary';
  permissionButton.type = 'button';
  permissionButton.textContent = device.permissionGranted ? 'Use for Serial Monitor' : 'Allow USB access';
  permissionButton.addEventListener('click', async () => {
    permissionButton.disabled = true;
    if (device.permissionGranted) {
      selectUsbDevice(device);
      permissionButton.textContent = 'Selected for Serial Monitor';
      return;
    }

    usbStatus.textContent = 'Waiting for Android USB permission…';
    try {
      const grantedDevice = await requestUsbPermission(device.deviceId);
      selectUsbDevice(grantedDevice);
      permissionButton.textContent = 'Selected for Serial Monitor';
    } catch (error) {
      permissionButton.disabled = false;
      usbStatus.textContent = `USB access was not granted: ${error.message}`;
    }
  });
  item.append(permissionButton);
  usbDevices.append(item);
}

async function openSerialMonitor() {
  if (!selectedUsbDevice) {
    usbStatus.textContent = 'Choose an ESP32 USB adapter first.';
    return;
  }

  openSerialButton.disabled = true;
  usbStatus.textContent = 'Opening the Serial Monitor…';
  serialOutput.textContent = '';
  try {
    const device = await openSerial(selectedUsbDevice.deviceId, Number(serialBaud.value));
    usbStatus.textContent = `Serial Monitor connected to ${device.driver} at ${device.baudRate} baud. Reset the ESP32 to view boot output.`;
    closeSerialButton.disabled = false;
  } catch (error) {
    usbStatus.textContent = `Could not open the Serial Monitor: ${error.message}`;
    openSerialButton.disabled = false;
  }
}

async function closeSerialMonitor() {
  try {
    await closeSerial();
    usbStatus.textContent = 'Serial Monitor disconnected.';
  } catch (error) {
    usbStatus.textContent = `Could not disconnect cleanly: ${error.message}`;
  } finally {
    closeSerialButton.disabled = true;
    openSerialButton.disabled = selectedUsbDevice === null;
  }
}

async function flashFiles(parts, label) {
  if (!selectedUsbDevice || parts.length === 0) {
    usbStatus.textContent = 'Choose an ESP32 USB adapter and a .bin app file first.';
    return;
  }

  flashAppButton.disabled = true;
  flashBlinkTestButton.disabled = true;
  openSerialButton.disabled = true;
  flashProgress.hidden = false;
  flashProgress.value = 0;
  const totalBytes = parts.reduce((total, part) => total + part.file.size, 0);
  flashOutput.textContent = `Preparing ${label} (${Math.ceil(totalBytes / 1024)} KB)…\n`;
  usbStatus.textContent = 'Flashing the ESP32. Keep the OTG cable connected.';

  try {
    if (!closeSerialButton.disabled) {
      await closeSerial();
      closeSerialButton.disabled = true;
    }
    const chipName = await flashFirmware({
      device: selectedUsbDevice,
      parts,
      onLog: appendFlashOutput,
      onProgress: (written, total) => {
        const percent = total ? Math.round((written / total) * 100) : 0;
        flashProgress.value = percent;
      },
    });
    flashProgress.value = 100;
    usbStatus.textContent = `${chipName} flashed successfully. Open the Serial Monitor to inspect your program.`;
    appendFlashOutput('\nFlash complete. The ESP32 was reset.\n');
  } catch (error) {
    usbStatus.textContent = `Flashing stopped: ${error.message}`;
    appendFlashOutput(`\n[Flash error] ${error.message}\n`);
  } finally {
    openSerialButton.disabled = selectedUsbDevice === null;
    updateFlashButton();
  }
}

async function flashSelectedBinary() {
  const [file] = appBinaryInput.files;
  await flashFiles([{ file, address: 0x10000 }], file?.name || 'app binary');
}

async function flashBlinkTest() {
  if (!selectedUsbDevice) return;

  try {
    const files = await Promise.all([
      ['bootloader', '/firmware/esp32-native-flash-test/esp32-blink-test.ino.bootloader.bin', 0x1000],
      ['partitions', '/firmware/esp32-native-flash-test/esp32-blink-test.ino.partitions.bin', 0x8000],
      ['OTA selector', '/firmware/esp32-native-flash-test/boot_app0.bin', 0xe000],
      ['application', '/firmware/esp32-native-flash-test/esp32-blink-test.ino.bin', 0x10000],
    ].map(async ([name, url, address]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The built-in test files are unavailable. Reinstall the latest RoboCode APK.');
      const bytes = await response.arrayBuffer();
      return {
        file: new File([bytes], `robocode-${name}.bin`, { type: 'application/octet-stream' }),
        address,
      };
    }));
    await flashFiles(files, 'RoboCode Blink test bundle');
  } catch (error) {
    usbStatus.textContent = `Could not prepare the Blink test: ${error.message}`;
    appendFlashOutput(`\n[Flash error] ${error.message}\n`);
  }
}

async function enableSerialEvents() {
  if (!isNativeRoboCodeApp()) return;
  serialListenerHandles = await Promise.all([
    addSerialListener('serialData', ({ data }) => appendSerialOutput(data)),
    addSerialListener('serialError', ({ message }) => {
      appendSerialOutput(`\n[Serial error] ${message}\n`);
      usbStatus.textContent = `Serial Monitor stopped: ${message}`;
      closeSerialButton.disabled = true;
      openSerialButton.disabled = selectedUsbDevice === null;
    }),
  ]);
}

async function checkUsbConnection() {
  if (!isNativeRoboCodeApp()) {
    usbStatus.textContent = 'USB detection is available in the RoboCode Android app. The browser version keeps using ArduinoDroid.';
    return;
  }

  checkUsbButton.disabled = true;
  usbStatus.textContent = 'Looking for supported USB serial devices…';
  usbDevices.replaceChildren();
  try {
    const { devices } = await listUsbDevices();
    if (devices.length === 0) {
      usbStatus.textContent = 'No supported USB serial device found. Connect the ESP32 through OTG, then try again.';
      return;
    }

    usbStatus.textContent = 'Choose the ESP32 USB adapter and allow RoboCode to use it.';
    devices.forEach(showUsbDevice);
  } catch (error) {
    usbStatus.textContent = `Could not check USB devices: ${error.message}`;
  } finally {
    checkUsbButton.disabled = false;
  }
}

function loadBlinkExample() {
  Blockly.Events.disable();
  try {
    workspace.clear();
    const start = workspace.newBlock('robocode_start');
    const ledOn = workspace.newBlock('robocode_set_builtin_led');
    const waitOn = workspace.newBlock('robocode_wait_ms');
    const ledOff = workspace.newBlock('robocode_set_builtin_led');
    const waitOff = workspace.newBlock('robocode_wait_ms');

    for (const block of [start, ledOn, waitOn, ledOff, waitOff]) {
      block.initSvg();
    }

    ledOn.setFieldValue('ON', 'STATE');
    waitOn.setFieldValue(1000, 'MILLISECONDS');
    ledOff.setFieldValue('OFF', 'STATE');
    waitOff.setFieldValue(1000, 'MILLISECONDS');

    start.getInput('DO').connection.connect(ledOn.previousConnection);
    ledOn.nextConnection.connect(waitOn.previousConnection);
    waitOn.nextConnection.connect(ledOff.previousConnection);
    ledOff.nextConnection.connect(waitOff.previousConnection);
    start.render();
    start.moveBy(48, 44);
  } finally {
    Blockly.Events.enable();
  }
  updateGeneratedCode();
  projectStatus.textContent = 'Blink example loaded.';
}

workspace.addChangeListener((event) => {
  if (!event.isUiEvent) updateGeneratedCode();
});

document.querySelector('#load-blink').addEventListener('click', loadBlinkExample);
document.querySelector('#save-project').addEventListener('click', () => {
  const project = createProject(workspace);
  downloadFile(JSON.stringify(project, null, 2), 'robocode-project.json', 'application/json');
  projectStatus.textContent = 'Project saved as robocode-project.json.';
});

document.querySelector('#load-project').addEventListener('click', () => projectFileInput.click());
projectFileInput.addEventListener('change', async () => {
  const [file] = projectFileInput.files;
  if (!file) return;

  try {
    loadProject(workspace, JSON.parse(await file.text()));
    updateGeneratedCode();
    projectStatus.textContent = `Loaded ${file.name}.`;
  } catch (error) {
    projectStatus.textContent = `Could not load ${file.name}: ${error.message}`;
  } finally {
    projectFileInput.value = '';
  }
});

document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeElement.textContent);
    copyStatus.textContent = 'Copied. Paste this into an Arduino sketch named robocode_blink.ino.';
  } catch {
    copyStatus.textContent = 'Copy was blocked by the browser. Select the code and copy it manually.';
  }
});

document.querySelector('#download-code').addEventListener('click', () => {
  downloadFile(codeElement.textContent, 'robocode_blink.ino', 'text/x-arduino');
  copyStatus.textContent = 'Downloaded robocode_blink.ino. Open it in ArduinoDroid, then compile and upload.';
});
checkUsbButton.addEventListener('click', checkUsbConnection);
buildTab.addEventListener('click', () => setActiveTab('build'));
hardwareTab.addEventListener('click', () => setActiveTab('hardware'));
toggleSketchButton.addEventListener('click', () => setSketchExpanded(sketchContent.hidden));
openSerialButton.addEventListener('click', openSerialMonitor);
closeSerialButton.addEventListener('click', closeSerialMonitor);
appBinaryInput.addEventListener('change', () => {
  const [file] = appBinaryInput.files;
  flashOutput.textContent = file
    ? `${file.name} selected. It will be written at 0x10000.\n`
    : 'Choose an ESP32 application binary.';
  updateFlashButton();
});
flashAppButton.addEventListener('click', flashSelectedBinary);
flashBlinkTestButton.addEventListener('click', flashBlinkTest);
clearSerialButton.addEventListener('click', () => {
  serialOutput.textContent = '';
});

new ResizeObserver(() => Blockly.svgResize(workspace)).observe(document.querySelector('#blockly-div'));
updateGeneratedCode();
setSketchExpanded(false);
usbStatus.textContent = isNativeRoboCodeApp()
  ? 'Connect your ESP32 through OTG, then choose Check ESP32.'
  : 'USB detection is available in the RoboCode Android app. The browser version keeps using ArduinoDroid.';
enableSerialEvents();
