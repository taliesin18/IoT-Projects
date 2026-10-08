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
