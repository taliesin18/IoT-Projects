import * as Blockly from 'blockly';
import './style.css';
import { defineRoboCodeBlocks, toolbox } from './blocks.js';
import { generateArduinoCode } from './generator.js';
import { createProject, ensureStartBlock, loadProject } from './project.js';
import {
  checkCompiler,
  compileGeneratedSketch,
  listCompilerPorts,
  loadCompilerSettings,
  saveCompilerSettings,
  uploadGeneratedSketch,
} from './compiler.js';
import { flashFirmware } from './esp-flash.js';
import { compileOnPhone, phoneCompilerStatus } from './phone-compiler.js';
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
    <div class="brand-lockup">
      <div class="brand-mark" aria-hidden="true"><span>R</span><i></i><b></b></div>
      <div>
        <p class="brand-kicker">ROBOCODE <span>PHASE 1</span></p>
        <h1>Build ideas that come alive.</h1>
        <p class="subtitle">Make real ESP32 projects with blocks — then test them on your board.</p>
      </div>
    </div>
    <div class="header-side">
      <div class="journey" aria-label="RoboCode learning path">
        <span class="journey-label">YOUR JOURNEY</span>
        <ol>
          <li><span>1</span>Project</li>
          <li><span>2</span>Build</li>
          <li><span>3</span>Hardware</li>
        </ol>
      </div>
      <div class="status"><span></span><div><strong>RoboCode ready</strong><small>Blocks become Arduino code</small></div></div>
    </div>
  </header>
  <main class="app-main">
    <section class="quick-toolbar" aria-label="Run your RoboCode program">
      <div class="toolbar-group toolbar-run-group">
        <span class="toolbar-label">Run your program</span>
        <button id="check-usb" class="run-action secondary" type="button"><span class="action-icon" aria-hidden="true">🔌</span><span>Check ESP32</span></button>
        <button id="compile-phone-flash" class="run-action primary-action" type="button" disabled><span class="action-icon" aria-hidden="true">🚀</span><span>Compile &amp; Flash</span></button>
        <button id="compile-phone" class="run-action secondary" type="button" disabled><span class="action-icon" aria-hidden="true">🧪</span><span>Compile</span></button>
        <button id="flash-last-build" class="run-action secondary" type="button" disabled><span class="action-icon" aria-hidden="true">⚡</span><span>Flash last build</span></button>
        <span id="board-status" class="board-status" data-state="idle" aria-live="polite">Not checked</span>
      </div>
    </section>
    <div class="app-tabs" role="tablist" aria-label="RoboCode work areas">
      <button id="project-tab" class="tab-button" role="tab" aria-controls="project-panel" aria-selected="false" type="button"><span aria-hidden="true">📁</span><span>Project</span></button>
      <button id="build-tab" class="tab-button" role="tab" aria-controls="build-panel" aria-selected="true" type="button"><span aria-hidden="true">🧱</span><span>Build</span></button>
      <button id="hardware-tab" class="tab-button" role="tab" aria-controls="hardware-panel" aria-selected="false" type="button"><span aria-hidden="true">🔧</span><span>Hardware</span></button>
    </div>
    <div id="project-panel" class="tab-panel project-layout" role="tabpanel" aria-labelledby="project-tab" hidden>
      <section class="project-hub" aria-labelledby="project-heading">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">YOUR WORK</p>
            <h2 id="project-heading">Project tools</h2>
          </div>
        </div>
        <p class="project-intro">When your program is taking shape, come here to save it, open it again, or move pieces between programs. Your usual journey is <strong>Project → Build → Hardware</strong>.</p>
        <div class="project-actions-grid">
          <button id="new-project" class="project-action" type="button"><span class="action-icon" aria-hidden="true">✨</span><span>New project</span><small>Start with one empty START block</small></button>
          <button id="copy-blocks" class="project-action" type="button"><span class="action-icon" aria-hidden="true">📋</span><span>Copy blocks</span><small>Copy the selected stack</small></button>
          <button id="paste-blocks" class="project-action" type="button"><span class="action-icon" aria-hidden="true">📌</span><span>Paste blocks</span><small>Add your copied stack</small></button>
          <button id="save-project" class="project-action" type="button"><span class="action-icon" aria-hidden="true">💾</span><span>Save project</span><small>Keep your blocks as a RoboCode file</small></button>
          <button id="load-project" class="project-action" type="button"><span class="action-icon" aria-hidden="true">📂</span><span>Open project</span><small>Continue a saved RoboCode file</small></button>
          <button id="copy-code" class="project-action" type="button"><span class="action-icon" aria-hidden="true">📄</span><span>Copy .ino</span><small>Copy the Arduino sketch</small></button>
          <button id="download-code" class="project-action" type="button"><span class="action-icon" aria-hidden="true">⬇️</span><span>Download .ino</span><small>Save an Arduino sketch file</small></button>
        </div>
        <input id="project-file" type="file" accept="application/json,.json" hidden>
        <p id="project-status" class="hint project-status" aria-live="polite">Projects are saved locally as RoboCode JSON files.</p>
      </section>
    </div>
    <div id="build-panel" class="tab-panel build-layout" role="tabpanel" aria-labelledby="build-tab">
      <section class="workspace-panel" aria-labelledby="workspace-heading">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">1. BUILD</p>
            <h2 id="workspace-heading">Program blocks</h2>
          </div>
        </div>
        <div id="blockly-div" aria-label="Blockly programming workspace"></div>
        <p class="hint">Use one <strong>START</strong> block. Its contents repeat inside Arduino <code>loop()</code>.</p>
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
          <pre><code id="generated-code"></code></pre>
          <p id="copy-status" class="hint" aria-live="polite">The sketch is generated locally from your blocks.</p>
        </div>
      </section>
    </div>
    <div id="hardware-panel" class="tab-panel hardware-layout" role="tabpanel" aria-labelledby="hardware-tab" hidden>
      <section class="usb-panel" aria-labelledby="usb-heading">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">3. HARDWARE · ANDROID BETA</p>
            <h2 id="usb-heading">Build, flash, and inspect your ESP32</h2>
          </div>
        </div>
        <div class="hardware-tabs" role="tablist" aria-label="Hardware tools">
          <button id="program-tab" class="hardware-tab-button" role="tab" aria-controls="program-panel" aria-selected="true" type="button">Program</button>
          <button id="connection-tab" class="hardware-tab-button" role="tab" aria-controls="connection-panel" aria-selected="false" type="button">Connection &amp; serial</button>
          <button id="advanced-tab" class="hardware-tab-button" role="tab" aria-controls="advanced-panel" aria-selected="false" type="button">Advanced</button>
        </div>
        <div id="program-panel" class="hardware-subpanel" role="tabpanel" aria-labelledby="program-tab">
          <div class="workflow-intro"><strong>Ready to run?</strong> First choose <strong>Check ESP32</strong> in the toolbar. Then use <strong>Compile &amp; Flash</strong> to build your current blocks and send them to the board.</div>
          <div class="compiler-panel">
          <div class="flash-heading">
            <p class="eyebrow">3.3 · PHONE COMPILER · BETA</p>
            <h3>Compile your blocks on this phone</h3>
          </div>
          <p class="hint">The compiler is included in the APK and works offline. Use the Run buttons in the toolbar above; this panel shows what happened.</p>
          <pre id="phone-compiler-output" aria-live="polite">Checking the bundled compiler…</pre>
        </div>
        </div>
        <div id="connection-panel" class="hardware-subpanel" role="tabpanel" aria-labelledby="connection-tab" hidden>
          <div class="panel-heading compact-heading">
            <div>
              <p class="eyebrow">STEP 1 · CONNECT</p>
              <h3>Choose your ESP32 USB adapter</h3>
            </div>
          </div>
          <p id="usb-status" class="hint" aria-live="polite">Use <strong>Check ESP32</strong> in the toolbar above, then choose your adapter.</p>
          <ul id="usb-devices" class="usb-devices" aria-live="polite"></ul>
          <div class="serial-monitor" aria-labelledby="serial-heading">
            <div class="serial-controls">
              <div>
                <p class="eyebrow">OPTIONAL · AFTER FLASHING</p>
                <h3 id="serial-heading">Serial Monitor</h3>
              </div>
              <label for="serial-baud">Speed</label>
              <select id="serial-baud" disabled>
                <option value="115200">115200 baud</option>
                <option value="9600">9600 baud</option>
              </select>
              <button id="open-serial" type="button" disabled>Open monitor</button>
              <button id="close-serial" class="secondary" type="button" disabled>Disconnect</button>
              <button id="clear-serial" class="secondary" type="button" disabled>Clear</button>
            </div>
            <p id="serial-empty-state" class="hint">Select an ESP32 USB adapter above to activate the Serial Monitor.</p>
            <pre id="serial-output" aria-live="polite" hidden></pre>
          </div>
        </div>
        <div id="advanced-panel" class="hardware-subpanel" role="tabpanel" aria-labelledby="advanced-tab" hidden>
          <details class="developer-compiler">
            <summary>Developer PC compiler (optional)</summary>
            <div class="compiler-panel">
          <div class="flash-heading">
            <div>
              <p class="eyebrow">3.3 · LOCAL WI-FI COMPILER</p>
              <h3>Compile blocks and flash</h3>
            </div>
          </div>
          <p class="hint">Run RoboCode's compiler on your prepared PC, then enter the PC URL and access token shown there. The sketch stays on your local network.</p>
          <div class="compiler-controls">
            <label for="compiler-url">PC URL</label>
            <input id="compiler-url" type="url" inputmode="url" placeholder="http://192.168.x.x:8787" autocomplete="off">
            <label for="compiler-token">Access token</label>
            <input id="compiler-token" type="password" autocomplete="off" placeholder="Shown by the PC compiler">
            <button id="save-compiler" class="secondary" type="button">Save connection</button>
            <button id="check-compiler" class="secondary" type="button">Check compiler</button>
            <button id="compile-blocks" type="button" disabled>Compile blocks &amp; flash</button>
          </div>
          <pre id="compiler-output" aria-live="polite">Start the PC compiler, enter its URL and token, then choose an ESP32 USB adapter.</pre>
          <div id="laptop-upload-panel" class="laptop-upload-panel" hidden>
            <p class="eyebrow">LAPTOP BROWSER · BETA</p>
            <h3>Compile and upload from this laptop</h3>
            <p class="hint">With the compiler running on this laptop, use the same URL and token above, then choose the ESP32 COM port. This uses Arduino CLI directly; laptop Serial Monitor is a later step.</p>
            <div class="compiler-controls">
              <button id="refresh-laptop-ports" class="secondary" type="button">Find COM ports</button>
              <label for="laptop-port">ESP32 port</label>
              <select id="laptop-port" disabled><option value="">Find COM ports first</option></select>
              <button id="upload-from-laptop" type="button" disabled>Compile &amp; upload from laptop</button>
            </div>
            <pre id="laptop-upload-output" aria-live="polite">Start the local compiler, enter its token, then find the ESP32 COM port.</pre>
          </div>
            </div>
          </details>
          <details class="advanced-flash-tools">
            <summary>Manual app flashing and test tools</summary>
            <div class="flash-panel">
          <div class="flash-heading">
            <div>
              <p class="eyebrow">EXPERIMENTAL · PHONE-ONLY</p>
              <h3>Flash an ESP32 app binary</h3>
            </div>
          </div>
          <p class="hint">Use this only for a compatible classic-ESP32 application binary. Most projects should use <strong>Compile &amp; flash</strong> in Program instead.</p>
          <div class="flash-controls">
            <button id="flash-blink-test" class="secondary" type="button" disabled>Flash RoboCode Blink test</button>
            <input id="app-binary" type="file" accept=".bin,application/octet-stream">
            <button id="flash-app" type="button" disabled>Flash app .bin</button>
          </div>
          <progress id="flash-progress" max="100" value="0" hidden></progress>
          <pre id="flash-output" aria-live="polite">Choose an ESP32 USB adapter before using manual flash tools.</pre>
            </div>
          </details>
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

workspace.registerButtonCallback('CREATE_LOCAL_VARIABLE', (button) => {
  Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace());
});

const codeElement = document.querySelector('#generated-code');
const copyStatus = document.querySelector('#copy-status');
const projectStatus = document.querySelector('#project-status');
const projectFileInput = document.querySelector('#project-file');
const usbStatus = document.querySelector('#usb-status');
const usbDevices = document.querySelector('#usb-devices');
const checkUsbButton = document.querySelector('#check-usb');
const boardStatus = document.querySelector('#board-status');
const projectTab = document.querySelector('#project-tab');
const buildTab = document.querySelector('#build-tab');
const hardwareTab = document.querySelector('#hardware-tab');
const projectPanel = document.querySelector('#project-panel');
const buildPanel = document.querySelector('#build-panel');
const hardwarePanel = document.querySelector('#hardware-panel');
const programTab = document.querySelector('#program-tab');
const connectionTab = document.querySelector('#connection-tab');
const advancedTab = document.querySelector('#advanced-tab');
const programPanel = document.querySelector('#program-panel');
const connectionPanel = document.querySelector('#connection-panel');
const advancedPanel = document.querySelector('#advanced-panel');
const toggleSketchButton = document.querySelector('#toggle-sketch');
const sketchContent = document.querySelector('#sketch-content');
const copyBlocksButton = document.querySelector('#copy-blocks');
const pasteBlocksButton = document.querySelector('#paste-blocks');
const serialBaud = document.querySelector('#serial-baud');
const openSerialButton = document.querySelector('#open-serial');
const closeSerialButton = document.querySelector('#close-serial');
const clearSerialButton = document.querySelector('#clear-serial');
const serialOutput = document.querySelector('#serial-output');
const serialEmptyState = document.querySelector('#serial-empty-state');
const appBinaryInput = document.querySelector('#app-binary');
const flashAppButton = document.querySelector('#flash-app');
const flashBlinkTestButton = document.querySelector('#flash-blink-test');
const flashProgress = document.querySelector('#flash-progress');
const flashOutput = document.querySelector('#flash-output');
const compilerUrl = document.querySelector('#compiler-url');
const compilerToken = document.querySelector('#compiler-token');
const saveCompilerButton = document.querySelector('#save-compiler');
const checkCompilerButton = document.querySelector('#check-compiler');
const compileBlocksButton = document.querySelector('#compile-blocks');
const compilerOutput = document.querySelector('#compiler-output');
const laptopUploadPanel = document.querySelector('#laptop-upload-panel');
const refreshLaptopPortsButton = document.querySelector('#refresh-laptop-ports');
const laptopPortSelect = document.querySelector('#laptop-port');
const uploadFromLaptopButton = document.querySelector('#upload-from-laptop');
const laptopUploadOutput = document.querySelector('#laptop-upload-output');
const phoneCompileButton = document.querySelector('#compile-phone');
const phoneFlashButton = document.querySelector('#compile-phone-flash');
const flashLastBuildButton = document.querySelector('#flash-last-build');
const phoneCompilerOutput = document.querySelector('#phone-compiler-output');
let phoneCompilerAvailable = false;
let phoneCompilerBusy = false;
let pcCompilerBusy = false;
let flashBusy = false;
let selectedUsbDevice = null;
let serialListenerHandles = [];
let copiedBlockState = null;
let lastSelectedBlockId = null;
let pasteCount = 0;
let lastPhoneBuild = null;

function updateGeneratedCode() {
  const sketch = generateArduinoCode(workspace);
  codeElement.textContent = sketch;
  if (lastPhoneBuild && lastPhoneBuild.sketch !== sketch) {
    copyStatus.textContent = 'Blocks changed — compile again before flashing this new program.';
  }
  updateCompileButton();
}

function setBoardStatus(message, state = 'idle') {
  boardStatus.textContent = message;
  boardStatus.dataset.state = state;
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

function selectedWorkspaceBlock() {
  const selected = Blockly.getSelected();
  if (selected?.workspace === workspace && typeof selected.type === 'string') {
    lastSelectedBlockId = selected.id;
    return selected;
  }

  const visiblySelected = workspace.getAllBlocks(false)
    .find((block) => block.isSelected?.() && typeof block.type === 'string');
  if (visiblySelected) {
    lastSelectedBlockId = visiblySelected.id;
    return visiblySelected;
  }

  const remembered = lastSelectedBlockId && workspace.getBlockById(lastSelectedBlockId);
  return remembered && typeof remembered.type === 'string' ? remembered : null;
}

async function copySelectedBlocks() {
  const selected = selectedWorkspaceBlock();
  if (!selected) {
    projectStatus.textContent = 'Select a block stack first, then choose Copy blocks.';
    return;
  }
  if (selected.type === 'robocode_start') {
    projectStatus.textContent = 'START is the one permanent entry point. Copy the blocks inside it instead.';
    return;
  }
  copiedBlockState = Blockly.serialization.blocks.save(selected, { doFullSerialization: true });
  if (!copiedBlockState) {
    projectStatus.textContent = 'That selection cannot be copied as a block stack.';
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(copiedBlockState));
    projectStatus.textContent = 'Copied the selected block stack. Choose Paste blocks to add it again.';
  } catch {
    projectStatus.textContent = 'Copied the selected block stack inside RoboCode. Choose Paste blocks to add it again.';
  }
}

async function pasteBlocks() {
  let state = copiedBlockState;
  if (!state) {
    try {
      state = JSON.parse(await navigator.clipboard.readText());
    } catch {
      projectStatus.textContent = 'Copy a RoboCode block stack first.';
      return;
    }
  }
  if (!state || typeof state.type !== 'string' || !state.type.startsWith('robocode_')) {
    projectStatus.textContent = 'Clipboard does not contain a RoboCode block stack.';
    return;
  }
  if (state.type === 'robocode_start') {
    projectStatus.textContent = 'A project keeps one START block. Paste the blocks inside START instead.';
    return;
  }
  try {
    const pastedState = JSON.parse(JSON.stringify(state));
    const block = Blockly.serialization.blocks.append(pastedState, workspace, { recordUndo: true });
    pasteCount += 1;
    block.moveBy(48 * pasteCount, 48 * pasteCount);
    block.select();
    lastSelectedBlockId = block.id;
    Blockly.svgResize(workspace);
    projectStatus.textContent = 'Pasted the block stack. It is selected and ready to move.';
  } catch (error) {
    projectStatus.textContent = `Could not paste blocks: ${error.message}`;
  }
}

function setActiveTab(tabName) {
  const tabs = { project: projectTab, build: buildTab, hardware: hardwareTab };
  const panels = { project: projectPanel, build: buildPanel, hardware: hardwarePanel };
  Object.entries(tabs).forEach(([name, tab]) => tab.setAttribute('aria-selected', String(name === tabName)));
  Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== tabName; });
  if (tabName === 'build') Blockly.svgResize(workspace);
}

function setHardwareTab(tabName) {
  const tabs = { program: programTab, connection: connectionTab, advanced: advancedTab };
  const panels = { program: programPanel, connection: connectionPanel, advanced: advancedPanel };
  Object.entries(tabs).forEach(([name, tab]) => tab.setAttribute('aria-selected', String(name === tabName)));
  Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== tabName; });
}

function setSketchExpanded(expanded) {
  sketchContent.hidden = !expanded;
  toggleSketchButton.setAttribute('aria-expanded', String(expanded));
  toggleSketchButton.textContent = expanded ? 'Hide sketch' : 'Show sketch';
}

function appendSerialOutput(text) {
  // ESP32 sketches commonly write CRLF. Normalizing it avoids Android WebView
  // rendering a carriage return as an in-place update instead of a new line.
  serialOutput.textContent += text.replace(/\r\n?/g, '\n');
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

function appendPhoneCompilerOutput(text) {
  phoneCompilerOutput.textContent += text.replace(/\r\n?/g, '\n');
  if (phoneCompilerOutput.textContent.length > 12000) {
    phoneCompilerOutput.textContent = phoneCompilerOutput.textContent.slice(-12000);
  }
  phoneCompilerOutput.scrollTop = phoneCompilerOutput.scrollHeight;
}

function updateFlashButton() {
  flashAppButton.disabled = flashBusy || phoneCompilerBusy || pcCompilerBusy || !selectedUsbDevice || appBinaryInput.files.length === 0;
  flashBlinkTestButton.disabled = flashBusy || phoneCompilerBusy || pcCompilerBusy || !selectedUsbDevice;
}

function updateCompileButton() {
  compileBlocksButton.disabled = flashBusy || phoneCompilerBusy || pcCompilerBusy || !selectedUsbDevice || !compilerUrl.value.trim() || !compilerToken.value.trim();
  phoneCompileButton.disabled = flashBusy || phoneCompilerBusy || pcCompilerBusy || !phoneCompilerAvailable;
  phoneFlashButton.disabled = flashBusy || phoneCompilerBusy || pcCompilerBusy || !phoneCompilerAvailable || !selectedUsbDevice;
  const hasCurrentPhoneBuild = Boolean(lastPhoneBuild) && lastPhoneBuild.sketch === codeElement.textContent;
  flashLastBuildButton.disabled = flashBusy || phoneCompilerBusy || pcCompilerBusy || !phoneCompilerAvailable || !selectedUsbDevice || !hasCurrentPhoneBuild;
  flashLastBuildButton.title = hasCurrentPhoneBuild
    ? 'Flash the most recent successful phone build.'
    : 'Compile the current blocks before flashing.';
  updateLaptopUploadButton();
}

function updateLaptopUploadButton() {
  const canUseCompiler = compilerUrl.value.trim() && compilerToken.value.trim();
  refreshLaptopPortsButton.disabled = pcCompilerBusy || !canUseCompiler;
  laptopPortSelect.disabled = pcCompilerBusy || laptopPortSelect.options.length <= 1;
  uploadFromLaptopButton.disabled = pcCompilerBusy || !canUseCompiler || !laptopPortSelect.value;
}

async function compilePhoneProgram(shouldFlash) {
  if (phoneCompilerBusy || pcCompilerBusy || flashBusy || !phoneCompilerAvailable) return;
  if (shouldFlash && !selectedUsbDevice) {
    setActiveTab('hardware');
    setHardwareTab('connection');
    usbStatus.textContent = 'Choose Check ESP32 in the toolbar, then select your USB adapter before flashing.';
    setBoardStatus('ESP32 not selected', 'warning');
    return;
  }
  phoneCompilerBusy = true;
  updateCompileButton();
  updateFlashButton();
  checkUsbButton.disabled = true;
  usbDevices.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  try {
    const sketch = codeElement.textContent;
    const result = await compileOnPhone(sketch, (message) => { phoneCompilerOutput.textContent = message; });
    const app = result.parts.find((part) => part.address === 0x10000);
    lastPhoneBuild = { parts: result.parts, sketch, sketchHash: result.sketchHash };
    phoneCompilerOutput.textContent = `Compiled on this phone: ${Math.ceil(app.file.size / 1024)} KB app. Sketch ${result.sketchHash}.`;
    if (shouldFlash) {
      await flashFiles(result.parts, 'your phone-compiled Blockly program', 'ESP32', {
        set: (text) => { phoneCompilerOutput.textContent = text; },
        append: appendPhoneCompilerOutput,
      });
    }
  } catch (error) {
    phoneCompilerOutput.textContent = `Phone compilation failed: ${error.message}`;
  } finally {
    phoneCompilerBusy = false;
    checkUsbButton.disabled = !isNativeRoboCodeApp();
    usbDevices.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    updateCompileButton();
    updateFlashButton();
  }
}

async function flashLastPhoneBuild() {
  const hasCurrentPhoneBuild = lastPhoneBuild && lastPhoneBuild.sketch === codeElement.textContent;
  if (!hasCurrentPhoneBuild || !selectedUsbDevice || flashBusy || phoneCompilerBusy || pcCompilerBusy) return;
  setActiveTab('hardware');
  setHardwareTab('program');
  await flashFiles(lastPhoneBuild.parts, `your saved phone build (${lastPhoneBuild.sketchHash})`, 'ESP32', {
    set: (text) => { phoneCompilerOutput.textContent = text; },
    append: appendPhoneCompilerOutput,
  });
}

function selectUsbDevice(device) {
  selectedUsbDevice = device;
  serialBaud.disabled = false;
  openSerialButton.disabled = false;
  clearSerialButton.disabled = false;
  serialEmptyState.hidden = true;
  updateFlashButton();
  updateCompileButton();
  usbStatus.textContent = `USB access ready for ${device.driver}. Open the Serial Monitor at 115200 baud.`;
  setBoardStatus(`${device.driver} ready`, 'ready');
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
      setBoardStatus('USB permission needed', 'warning');
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
    serialOutput.hidden = false;
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

async function flashFiles(parts, label, expectedChip, output = {
  set: (text) => { flashOutput.textContent = text; },
  append: appendFlashOutput,
}) {
  if (flashBusy) return;
  if (!selectedUsbDevice || parts.length === 0) {
    usbStatus.textContent = 'Choose an ESP32 USB adapter and a .bin app file first.';
    return;
  }

  flashBusy = true;
  updateCompileButton();
  flashAppButton.disabled = true;
  flashBlinkTestButton.disabled = true;
  compileBlocksButton.disabled = true;
  openSerialButton.disabled = true;
  flashProgress.hidden = false;
  flashProgress.value = 0;
  const totalBytes = parts.reduce((total, part) => total + part.file.size, 0);
  output.set(`Preparing ${label} (${Math.ceil(totalBytes / 1024)} KB)…\n`);
  usbStatus.textContent = 'Flashing the ESP32. Keep the OTG cable connected.';

  try {
    if (!closeSerialButton.disabled) {
      await closeSerial();
      closeSerialButton.disabled = true;
    }
    const chipName = await flashFirmware({
      device: selectedUsbDevice,
      parts,
      expectedChip,
      onLog: output.append,
      onProgress: (written, total) => {
        const percent = total ? Math.round((written / total) * 100) : 0;
        flashProgress.value = percent;
      },
    });
    flashProgress.value = 100;
    usbStatus.textContent = `${chipName} flashed successfully. Open the Serial Monitor to inspect your program.`;
    output.append('\nFlash complete. The ESP32 was reset.\n');
  } catch (error) {
    usbStatus.textContent = `Flashing stopped: ${error.message}`;
    output.append(`\n[Flash error] ${error.message}\n`);
  } finally {
    flashBusy = false;
    openSerialButton.disabled = selectedUsbDevice === null;
    updateFlashButton();
    updateCompileButton();
  }
}

function saveCompilerConnection() {
  try {
    const settings = saveCompilerSettings({ url: compilerUrl.value, token: compilerToken.value });
    compilerUrl.value = settings.url;
    compilerToken.value = settings.token;
    compilerOutput.textContent = 'Compiler connection saved on this device.';
  } catch (error) {
    compilerOutput.textContent = `Could not save the compiler connection: ${error.message}`;
  }
  updateCompileButton();
}

async function checkCompilerConnection() {
  checkCompilerButton.disabled = true;
  compilerOutput.textContent = 'Checking the PC compiler…';
  try {
    const result = await checkCompiler(compilerUrl.value);
    compilerOutput.textContent = `Compiler ready for ${result.fqbn}.`;
  } catch (error) {
    compilerOutput.textContent = `Compiler check failed: ${error.message}`;
  } finally {
    checkCompilerButton.disabled = false;
  }
}

async function compileBlocksAndFlash() {
  if (pcCompilerBusy || phoneCompilerBusy || flashBusy) return;
  if (!selectedUsbDevice) {
    usbStatus.textContent = 'Choose an ESP32 USB adapter first.';
    return;
  }

  pcCompilerBusy = true;
  updateCompileButton();
  updateFlashButton();
  checkUsbButton.disabled = true;
  usbDevices.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  compilerOutput.textContent = 'Sending your generated sketch to the local PC compiler…';
  try {
    const result = await compileGeneratedSketch({
      url: compilerUrl.value,
      token: compilerToken.value,
      sketch: generateArduinoCode(workspace),
    });
    const size = result.parts.reduce((total, part) => total + part.file.size, 0);
    compilerOutput.textContent = `Compiled ${result.fqbn} (${Math.ceil(size / 1024)} KB firmware bundle, sketch ${result.sketchHash}).`;
    await flashFiles(result.parts, 'your Blockly program', 'ESP32');
  } catch (error) {
    compilerOutput.textContent = `Compilation failed: ${error.message}`;
  } finally {
    pcCompilerBusy = false;
    checkUsbButton.disabled = !isNativeRoboCodeApp();
    usbDevices.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    updateCompileButton();
    updateFlashButton();
  }
}

async function refreshLaptopPorts() {
  if (pcCompilerBusy) return;
  refreshLaptopPortsButton.disabled = true;
  laptopUploadOutput.textContent = 'Looking for Arduino serial ports…';
  try {
    const ports = await listCompilerPorts({ url: compilerUrl.value, token: compilerToken.value });
    laptopPortSelect.replaceChildren(new Option(ports.length ? 'Choose the ESP32 port' : 'No serial ports found', ''));
    ports.forEach((port) => laptopPortSelect.add(new Option(port.label, port.address)));
    laptopUploadOutput.textContent = ports.length
      ? 'Choose the port used by your ESP32, then compile and upload.'
      : 'No serial ports were found. Connect the ESP32 USB cable, then try again.';
  } catch (error) {
    laptopUploadOutput.textContent = `Could not list ports: ${error.message}`;
  } finally {
    updateLaptopUploadButton();
  }
}

async function compileAndUploadFromLaptop() {
  if (pcCompilerBusy || !laptopPortSelect.value) return;
  pcCompilerBusy = true;
  updateCompileButton();
  laptopUploadOutput.textContent = `Compiling your blocks and uploading to ${laptopPortSelect.value}…`;
  try {
    const result = await uploadGeneratedSketch({
      url: compilerUrl.value,
      token: compilerToken.value,
      sketch: generateArduinoCode(workspace),
      port: laptopPortSelect.value,
    });
    const log = [result.log, result.uploadLog].filter(Boolean).join('\n');
    laptopUploadOutput.textContent = `Upload complete for ${result.fqbn} (sketch ${result.sketchHash}).${log ? `\n\n${log}` : ''}`;
  } catch (error) {
    laptopUploadOutput.textContent = `Laptop upload failed: ${error.message}`;
  } finally {
    pcCompilerBusy = false;
    updateCompileButton();
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
  setActiveTab('hardware');
  setHardwareTab('connection');
  if (!isNativeRoboCodeApp()) {
    usbStatus.textContent = 'USB detection is available in the RoboCode Android app. The browser version keeps using ArduinoDroid.';
    setBoardStatus('Available in Android app', 'idle');
    return;
  }

  checkUsbButton.disabled = true;
  usbStatus.textContent = 'Looking for supported USB serial devices…';
  setBoardStatus('Checking…', 'checking');
  usbDevices.replaceChildren();
  try {
    const { devices } = await listUsbDevices();
    if (devices.length === 0) {
      usbStatus.textContent = 'No supported USB serial device found. Connect the ESP32 through OTG, then try again.';
      setBoardStatus('No ESP32 found', 'warning');
      return;
    }

    usbStatus.textContent = 'Choose the ESP32 USB adapter and allow RoboCode to use it.';
    setBoardStatus('Choose an adapter', 'checking');
    devices.forEach(showUsbDevice);
  } catch (error) {
    usbStatus.textContent = `Could not check USB devices: ${error.message}`;
    setBoardStatus('Check failed', 'warning');
  } finally {
    checkUsbButton.disabled = false;
  }
}

workspace.addChangeListener((event) => {
  if (event.type === Blockly.Events.SELECTED && event.newElementId) {
    const selectedBlock = workspace.getBlockById(event.newElementId);
    if (selectedBlock) lastSelectedBlockId = selectedBlock.id;
  }
  if (!event.isUiEvent) updateGeneratedCode();
});

document.querySelector('#new-project').addEventListener('click', () => {
  Blockly.Events.disable();
  try {
    workspace.getAllBlocks(false).forEach((block) => block.setDeletable(true));
    workspace.clear();
    ensureStartBlock(workspace);
  } finally {
    Blockly.Events.enable();
  }
  copiedBlockState = null;
  lastSelectedBlockId = null;
  pasteCount = 0;
  updateGeneratedCode();
  projectStatus.textContent = 'New project ready. Add blocks inside START.';
  setActiveTab('build');
});
copyBlocksButton.addEventListener('click', copySelectedBlocks);
pasteBlocksButton.addEventListener('click', pasteBlocks);
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
    setActiveTab('build');
  } catch (error) {
    projectStatus.textContent = `Could not load ${file.name}: ${error.message}`;
  } finally {
    projectFileInput.value = '';
  }
});

document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeElement.textContent);
    copyStatus.textContent = 'Copied. Paste this into an Arduino sketch named robocode_program.ino.';
    projectStatus.textContent = 'Copied the Arduino sketch. Paste it into a sketch named robocode_program.ino.';
  } catch {
    copyStatus.textContent = 'Copy was blocked by the browser. Select the code and copy it manually.';
  }
});

document.querySelector('#download-code').addEventListener('click', () => {
  downloadFile(codeElement.textContent, 'robocode_program.ino', 'text/x-arduino');
  copyStatus.textContent = 'Downloaded robocode_program.ino. Open it in ArduinoDroid, then compile and upload.';
  projectStatus.textContent = 'Downloaded robocode_program.ino.';
});
checkUsbButton.addEventListener('click', checkUsbConnection);
projectTab.addEventListener('click', () => setActiveTab('project'));
buildTab.addEventListener('click', () => setActiveTab('build'));
hardwareTab.addEventListener('click', () => setActiveTab('hardware'));
programTab.addEventListener('click', () => setHardwareTab('program'));
connectionTab.addEventListener('click', () => setHardwareTab('connection'));
advancedTab.addEventListener('click', () => setHardwareTab('advanced'));
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
saveCompilerButton.addEventListener('click', saveCompilerConnection);
checkCompilerButton.addEventListener('click', checkCompilerConnection);
compileBlocksButton.addEventListener('click', compileBlocksAndFlash);
refreshLaptopPortsButton.addEventListener('click', refreshLaptopPorts);
uploadFromLaptopButton.addEventListener('click', compileAndUploadFromLaptop);
compilerUrl.addEventListener('input', updateCompileButton);
compilerToken.addEventListener('input', updateCompileButton);
laptopPortSelect.addEventListener('change', updateLaptopUploadButton);
flashAppButton.addEventListener('click', flashSelectedBinary);
flashBlinkTestButton.addEventListener('click', flashBlinkTest);
clearSerialButton.addEventListener('click', () => {
  serialOutput.textContent = '';
});

new ResizeObserver(() => Blockly.svgResize(workspace)).observe(document.querySelector('#blockly-div'));
ensureStartBlock(workspace);
updateGeneratedCode();
setSketchExpanded(false);
setHardwareTab('program');
const savedCompilerSettings = loadCompilerSettings();
compilerUrl.value = savedCompilerSettings.url;
compilerToken.value = savedCompilerSettings.token;
laptopUploadPanel.hidden = isNativeRoboCodeApp();
if (!isNativeRoboCodeApp() && !compilerUrl.value) compilerUrl.value = 'http://localhost:8787';
updateCompileButton();
usbStatus.textContent = isNativeRoboCodeApp()
  ? 'Connect your ESP32 through OTG, then choose Check ESP32.'
  : 'USB detection is available in the RoboCode Android app. The browser version keeps using ArduinoDroid.';
setBoardStatus(isNativeRoboCodeApp() ? 'Not checked' : 'Available in Android app', 'idle');
enableSerialEvents();
phoneCompileButton.addEventListener('click', () => {
  setActiveTab('hardware');
  setHardwareTab('program');
  compilePhoneProgram(false);
});
phoneFlashButton.addEventListener('click', () => {
  setActiveTab('hardware');
  setHardwareTab('program');
  compilePhoneProgram(true);
});
flashLastBuildButton.addEventListener('click', flashLastPhoneBuild);
phoneCompilerStatus().then((status) => {
  phoneCompilerAvailable = status.available;
  phoneCompilerOutput.textContent = status.message;
  updateCompileButton();
}).catch((error) => { phoneCompilerOutput.textContent = `Phone compiler unavailable: ${error.message}`; });
