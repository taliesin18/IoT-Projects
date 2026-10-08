import { ESPLoader, Transport } from 'esptool-js';
import {
  addSerialListener,
  closeFlashPort,
  openFlashPort,
  setFlashBaudRate,
  setFlashSignals,
  writeFlash,
} from './usb.js';

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

class RoboCodeNativeSerialPort {
  constructor(device) {
    this.device = device;
    this.readable = null;
    this.writable = null;
    this.readerController = null;
    this.flashDataListener = null;
    this.opened = false;
  }

  getInfo() {
    return {
      usbVendorId: Number.parseInt(this.device.vendorId, 16),
      usbProductId: Number.parseInt(this.device.productId, 16),
    };
  }

  async open({ baudRate = 115200 } = {}) {
    if (this.opened) return;

    this.readable = new ReadableStream({
      start: (controller) => {
        this.readerController = controller;
      },
    });
    this.writable = new WritableStream({
      write: async (chunk) => {
        await writeFlash(bytesToBase64(new Uint8Array(chunk)));
      },
    });
    this.flashDataListener = await addSerialListener('flashData', ({ data }) => {
      if (this.readerController) this.readerController.enqueue(base64ToBytes(data));
    });

    try {
      await openFlashPort(this.device.deviceId, baudRate);
      this.opened = true;
    } catch (error) {
      await this.flashDataListener?.remove();
      this.flashDataListener = null;
      this.readerController?.error(error);
      throw error;
    }
  }

  async close() {
    if (!this.opened && !this.flashDataListener) return;
    this.opened = false;
    try {
      this.readerController?.close();
    } catch {
      // A cancelled reader has already closed the stream.
    }
    this.readerController = null;
    try {
      await this.flashDataListener?.remove();
    } finally {
      this.flashDataListener = null;
      await closeFlashPort();
    }
  }

  async setSignals({ dataTerminalReady, requestToSend } = {}) {
    await setFlashSignals({ dataTerminalReady, requestToSend });
  }

  async setBaudRate(baudRate) {
    await setFlashBaudRate(baudRate);
  }
}

function formatFlashError(error) {
  const message = error?.message || String(error);
  if (/serial data stream stopped|no serial data received/i.test(message)) {
    return 'The ESP32 did not enter download mode. Hold BOOT, tap EN/RESET once, release BOOT, then try Flash again.';
  }
  return message;
}

export async function flashAppBinary({ device, file, onLog, onProgress }) {
  const nativePort = new RoboCodeNativeSerialPort(device);
  const transport = new Transport(nativePort, false);
  const terminal = {
    clean: () => onLog('Preparing ESP32 connection…\n'),
    write: (message) => onLog(message),
    writeLine: (message) => onLog(`${message}\n`),
  };

  try {
    const loader = new ESPLoader({
      transport,
      baudrate: 115200,
      terminal,
      debugLogging: false,
    });
    const chipName = await loader.main('default_reset');
    onLog(`Connected to ${chipName}.\n`);

    const firmware = new Uint8Array(await file.arrayBuffer());
    await loader.writeFlash({
      fileArray: [{ data: firmware, address: 0x10000 }],
      flashMode: 'dio',
      flashFreq: '40m',
      flashSize: '4MB',
      eraseAll: false,
      compress: true,
      reportProgress: (_fileIndex, written, total) => onProgress(written, total),
    });
    await loader.after('hard_reset');
    return chipName;
  } catch (error) {
    throw new Error(formatFlashError(error));
  } finally {
    await transport.disconnect().catch(() => {});
  }
}
