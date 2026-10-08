package com.taliesin.robocode;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialProber;

import java.util.Map;

@CapacitorPlugin(name = "RoboCodeUsb")
public class RoboCodeUsbPlugin extends Plugin {
    private static final String USB_PERMISSION_ACTION = "com.taliesin.robocode.USB_PERMISSION";

    private UsbManager usbManager;
    private PluginCall pendingPermissionCall;
    private BroadcastReceiver permissionReceiver;

    @Override
    public void load() {
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        permissionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!USB_PERMISSION_ACTION.equals(intent.getAction()) || pendingPermissionCall == null) {
                    return;
                }

                PluginCall call = pendingPermissionCall;
                pendingPermissionCall = null;
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

                if (!granted || device == null) {
                    call.reject("USB access was not granted.");
                    return;
                }

                UsbSerialDriver driver = UsbSerialProber.getDefaultProber().probeDevice(device);
                if (driver == null) {
                    call.reject("The selected USB device is not a supported serial adapter.");
                    return;
                }

                call.resolve(toDeviceDetails(driver));
            }
        };

        IntentFilter filter = new IntentFilter(USB_PERMISSION_ACTION);
        ContextCompat.registerReceiver(getContext(), permissionReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        if (permissionReceiver != null) {
            getContext().unregisterReceiver(permissionReceiver);
            permissionReceiver = null;
        }
    }

    @PluginMethod
    public void listDevices(PluginCall call) {
        if (usbManager == null) {
            call.reject("Android USB host is unavailable on this device.");
            return;
        }

        JSArray devices = new JSArray();
        for (Map.Entry<String, UsbDevice> entry : usbManager.getDeviceList().entrySet()) {
            UsbSerialDriver driver = UsbSerialProber.getDefaultProber().probeDevice(entry.getValue());
            if (driver != null) {
                devices.put(toDeviceDetails(driver));
            }
        }

        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (usbManager == null) {
            call.reject("Android USB host is unavailable on this device.");
            return;
        }

        Integer deviceId = call.getInt("deviceId");
        if (deviceId == null) {
            call.reject("Choose an ESP32 USB serial device first.");
            return;
        }

        UsbDevice selectedDevice = null;
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            if (device.getDeviceId() == deviceId) {
                selectedDevice = device;
                break;
            }
        }

        if (selectedDevice == null) {
            call.reject("The selected USB device is no longer connected.");
            return;
        }

        UsbSerialDriver driver = UsbSerialProber.getDefaultProber().probeDevice(selectedDevice);
        if (driver == null) {
            call.reject("The selected USB device is not a supported serial adapter.");
            return;
        }

        if (usbManager.hasPermission(selectedDevice)) {
            call.resolve(toDeviceDetails(driver));
            return;
        }

        if (pendingPermissionCall != null) {
            call.reject("A USB permission request is already open.");
            return;
        }

        pendingPermissionCall = call;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        Intent permissionIntent = new Intent(USB_PERMISSION_ACTION).setPackage(getContext().getPackageName());
        PendingIntent permissionRequest = PendingIntent.getBroadcast(getContext(), selectedDevice.getDeviceId(), permissionIntent, flags);
        usbManager.requestPermission(selectedDevice, permissionRequest);
    }

    private JSObject toDeviceDetails(UsbSerialDriver driver) {
        UsbDevice device = driver.getDevice();
        JSObject details = new JSObject();
        details.put("deviceId", device.getDeviceId());
        details.put("vendorId", String.format("0x%04X", device.getVendorId()));
        details.put("productId", String.format("0x%04X", device.getProductId()));
        details.put("driver", driver.getClass().getSimpleName());
        details.put("ports", driver.getPorts().size());
        details.put("permissionGranted", usbManager.hasPermission(device));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            details.put("manufacturer", device.getManufacturerName());
            details.put("product", device.getProductName());
        }

        return details;
    }
}
