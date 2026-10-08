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

export function addSerialListener(eventName, listener) {
  return RoboCodeUsb.addListener(eventName, listener);
}
