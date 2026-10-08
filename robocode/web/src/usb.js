import { Capacitor, registerPlugin } from '@capacitor/core';

const RoboCodeUsb = registerPlugin('RoboCodeUsb');

export function isNativeRoboCodeApp() {
  return Capacitor.isNativePlatform();
}

export async function listUsbDevices() {
  return RoboCodeUsb.listDevices();
}

export async function requestUsbPermission(deviceId) {
  return RoboCodeUsb.requestPermission({ deviceId });
}

export async function openSerial(deviceId, baudRate) {
  return RoboCodeUsb.openSerial({ deviceId, baudRate });
}

export async function closeSerial() {
  return RoboCodeUsb.closeSerial();
}

export async function openFlashPort(deviceId, baudRate) {
  return RoboCodeUsb.openFlashPort({ deviceId, baudRate });
}

export async function writeFlash(data) {
  return RoboCodeUsb.writeFlash({ data });
}

export async function setFlashSignals({ dataTerminalReady, requestToSend }) {
  const options = {};
  if (dataTerminalReady !== undefined) options.dataTerminalReady = dataTerminalReady;
  if (requestToSend !== undefined) options.requestToSend = requestToSend;
  return RoboCodeUsb.setFlashSignals(options);
}

export async function setFlashBaudRate(baudRate) {
  return RoboCodeUsb.setFlashBaudRate({ baudRate });
}

export async function closeFlashPort() {
  return RoboCodeUsb.closeFlashPort();
}

export function addSerialListener(eventName, listener) {
  return RoboCodeUsb.addListener(eventName, listener);
}
