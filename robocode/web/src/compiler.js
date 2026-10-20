const settingsKey = 'robocode.compiler.settings.v1';

function normalizeServerUrl(value) {
  const parsed = new URL(value.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http:// or https:// compiler URL.');
  return parsed.toString().replace(/\/$/, '');
}

function base64ToFile(base64, filename) {
  const decoded = atob(base64);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return new File([bytes], filename, { type: 'application/octet-stream' });
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Cannot reach the compiler. Confirm it is running and the URL is correct.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Compiler request failed (${response.status}).`);
  return body;
}

export function loadCompilerSettings() {
  try {
    return JSON.parse(localStorage.getItem(settingsKey)) || { url: '', token: '' };
  } catch {
    return { url: '', token: '' };
  }
}

export function saveCompilerSettings({ url, token }) {
  const settings = { url: normalizeServerUrl(url), token: token.trim() };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  return settings;
}

export async function checkCompiler(url) {
  const settingsUrl = normalizeServerUrl(url);
  return request(`${settingsUrl}/health`);
}

export async function compileGeneratedSketch({ url, token, sketch }) {
  const settingsUrl = normalizeServerUrl(url);
  if (!token.trim()) throw new Error('Enter the compiler access token shown on the PC.');
  const result = await request(`${settingsUrl}/compile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sketch }),
  });
  return {
    ...result,
    parts: result.segments.map((segment) => ({
      address: segment.address,
      file: base64ToFile(segment.base64, segment.filename),
    })),
  };
}

export async function listCompilerPorts({ url, token }) {
  const settingsUrl = normalizeServerUrl(url);
  if (!token.trim()) throw new Error('Enter the compiler access token shown on the PC.');
  const result = await request(`${settingsUrl}/ports`, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  return result.ports || [];
}

export async function uploadGeneratedSketch({ url, token, sketch, port }) {
  const settingsUrl = normalizeServerUrl(url);
  if (!token.trim()) throw new Error('Enter the compiler access token shown on the PC.');
  if (!port) throw new Error('Choose the ESP32 serial port.');
  return request(`${settingsUrl}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sketch, port }),
  });
}
