import { Capacitor, registerPlugin } from '@capacitor/core';
import { esp32ImageFromElf } from './esp32-image.js';

const compiler = registerPlugin('RoboCodeCompiler');
const decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function phoneCompilerStatus() {
  if (!Capacitor.isNativePlatform()) return { available: false, message: 'Phone compilation is available in the RoboCode APK with the bundled compiler.' };
  return compiler.getStatus();
}

export async function compileOnPhone(sketch, onProgress = () => {}) {
  const listener = await compiler.addListener('compilerProgress', ({ message }) => onProgress(message));
  try {
    const result = await compiler.compile({ sketch });
    onProgress('Creating the ESP32 flash image…');
    const image = await esp32ImageFromElf(decode(result.elfBase64));
    return {
      fqbn: result.fqbn, sketchHash: result.sketchHash,
      parts: [
        ...result.segments.map((segment) => ({ address: segment.address, file: new File([decode(segment.base64)], segment.filename) })),
        { address: 0x10000, file: new File([image], 'robocode.ino.bin', { type: 'application/octet-stream' }) },
      ],
    };
  } finally {
    await listener.remove();
  }
}
