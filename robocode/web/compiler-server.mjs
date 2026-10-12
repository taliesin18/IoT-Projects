import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const port = Number.parseInt(process.env.ROBOCODE_COMPILER_PORT || '8787', 10);
const fqbn = process.env.ROBOCODE_FQBN || 'esp32:esp32:esp32';
const arduinoCli = process.env.ARDUINO_CLI_PATH || 'arduino-cli';
const arduinoConfig = process.env.ARDUINO_CLI_CONFIG;
const accessToken = process.env.ROBOCODE_COMPILER_TOKEN || randomBytes(24).toString('base64url');
const maxSketchBytes = 64 * 1024;
let compileInProgress = false;

function sendJson(response, status, body) {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(serialized),
    'Cache-Control': 'no-store',
  });
  response.end(serialized);
}

function authorized(request) {
  const received = request.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const expected = Buffer.from(accessToken);
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxSketchBytes + 1024) throw new Error('The request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function run(command, argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, { shell: false, windowsHide: true });
    let output = '';
    const append = (chunk) => {
      output = `${output}${chunk}`.slice(-30_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `Arduino CLI exited with code ${code}.`));
    });
  });
}

async function existingFile(filePath) {
  try {
    return (await stat(filePath)).isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function findBootApp0() {
  if (process.env.ROBOCODE_BOOT_APP0_PATH) {
    const configured = await existingFile(process.env.ROBOCODE_BOOT_APP0_PATH);
    if (configured) return configured;
    throw new Error('ROBOCODE_BOOT_APP0_PATH does not point to boot_app0.bin.');
  }

  const dataRoots = [
    process.env.ARDUINO_DATA_DIR,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Arduino15'),
    path.join(os.homedir(), '.arduino15'),
  ].filter(Boolean);

  for (const dataRoot of dataRoots) {
    const hardwareRoot = path.join(dataRoot, 'packages', 'esp32', 'hardware', 'esp32');
    try {
      const versions = (await readdir(hardwareRoot)).sort().reverse();
      for (const version of versions) {
        const candidate = await existingFile(path.join(hardwareRoot, version, 'tools', 'partitions', 'boot_app0.bin'));
        if (candidate) return candidate;
      }
    } catch {
      // Try the next standard Arduino data directory.
    }
  }
  throw new Error('Could not find ESP32 boot_app0.bin. Set ROBOCODE_BOOT_APP0_PATH to its full path.');
}

async function compileSketch(sketch) {
  if (typeof sketch !== 'string' || !sketch.trim()) throw new Error('The generated sketch is empty.');
  if (Buffer.byteLength(sketch) > maxSketchBytes) throw new Error('The generated sketch is too large for this compiler service.');

  const jobDirectory = await mkdtemp(path.join(os.tmpdir(), 'robocode-compile-'));
  const sketchDirectory = path.join(jobDirectory, 'robocode_program');
  const outputDirectory = path.join(jobDirectory, 'output');
  const sourceFile = path.join(sketchDirectory, 'robocode_program.ino');

  try {
    await mkdir(sketchDirectory);
    await mkdir(outputDirectory);
    await writeFile(sourceFile, sketch, 'utf8');

    const args = ['compile', '--fqbn', fqbn, sketchDirectory, '--output-dir', outputDirectory];
    if (arduinoConfig) args.push('--config-file', arduinoConfig);
    const log = await run(arduinoCli, args);
    const bootApp0 = await findBootApp0();
    const files = [
      { name: 'bootloader', filename: 'robocode_program.ino.bootloader.bin', address: 0x1000 },
      { name: 'partitions', filename: 'robocode_program.ino.partitions.bin', address: 0x8000 },
      { name: 'OTA selector', filename: 'boot_app0.bin', address: 0xe000, source: bootApp0 },
      { name: 'application', filename: 'robocode_program.ino.bin', address: 0x10000 },
    ];
    const segments = await Promise.all(files.map(async (segment) => {
      const bytes = await readFile(segment.source || path.join(outputDirectory, segment.filename));
      return {
        name: segment.name,
        filename: segment.filename,
        address: segment.address,
        base64: bytes.toString('base64'),
      };
    }));
    return { log, segments, sketchHash: createHash('sha256').update(sketch).digest('hex').slice(0, 12) };
  } finally {
    await rm(jobDirectory, { recursive: true, force: true });
  }
}

function localAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((network) => network && network.family === 'IPv4' && !network.internal)
    .map((network) => `http://${network.address}:${port}`);
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 200, {});
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ready', fqbn });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/compile') {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  if (!authorized(request)) {
    sendJson(response, 401, { error: 'Enter the compiler access token shown on the PC.' });
    return;
  }
  if (compileInProgress) {
    sendJson(response, 429, { error: 'A RoboCode compilation is already in progress. Try again in a moment.' });
    return;
  }

  compileInProgress = true;
  try {
    const { sketch } = await readJsonBody(request);
    const result = await compileSketch(sketch);
    sendJson(response, 200, { fqbn, ...result });
  } catch (error) {
    sendJson(response, 422, { error: error.message || 'Compilation failed.' });
  } finally {
    compileInProgress = false;
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`RoboCode compiler ready for ${fqbn}.`);
  console.log(`Phone URL: ${localAddresses().join(' or ') || `http://<this-PC-IP>:${port}`}`);
  console.log(`Access token: ${accessToken}`);
  if (!process.env.ROBOCODE_COMPILER_TOKEN) console.log('This temporary token changes whenever the service restarts.');
});
