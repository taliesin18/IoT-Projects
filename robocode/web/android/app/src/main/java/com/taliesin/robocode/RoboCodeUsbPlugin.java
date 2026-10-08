package com.taliesin.robocode;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@CapacitorPlugin(name = "RoboCodeUsb")
public class RoboCodeUsbPlugin extends Plugin {
    private static final String USB_PERMISSION_ACTION = "com.taliesin.robocode.USB_PERMISSION";

    private UsbManager usbManager;
    private PluginCall pendingPermissionCall;
    private BroadcastReceiver permissionReceiver;
    private UsbDeviceConnection serialConnection;
    private UsbSerialPort serialPort;
    private SerialInputOutputManager serialIoManager;
    private int connectedDeviceId = -1;
    private String activeDataEvent = "serialData";

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
        closeSerialConnection();
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

    @PluginMethod
    public void openSerial(PluginCall call) {
        openPort(call, "serialData", "Serial Monitor");
    }

    @PluginMethod
    public void openFlashPort(PluginCall call) {
        openPort(call, "flashData", "ESP32 flashing connection");
    }

    private void openPort(PluginCall call, String dataEvent, String connectionName) {
        if (usbManager == null) {
            call.reject("Android USB host is unavailable on this device.");
            return;
        }

        Integer deviceId = call.getInt("deviceId");
        int baudRate = call.getInt("baudRate", 115200);
        if (deviceId == null || baudRate <= 0) {
            call.reject("Choose a USB device and a valid baud rate.");
            return;
        }

        UsbDevice device = findDevice(deviceId);
        if (device == null) {
            call.reject("The selected USB device is no longer connected.");
            return;
        }
        if (!usbManager.hasPermission(device)) {
            call.reject("Allow USB access before opening the " + connectionName + ".");
            return;
        }

        UsbSerialDriver driver = UsbSerialProber.getDefaultProber().probeDevice(device);
        if (driver == null || driver.getPorts().isEmpty()) {
            call.reject("The selected USB device has no supported serial port.");
            return;
        }

        closeSerialConnection();
        UsbDeviceConnection connection = usbManager.openDevice(device);
        if (connection == null) {
            call.reject("Android could not open the selected USB device.");
            return;
        }

        UsbSerialPort port = driver.getPorts().get(0);
        try {
            port.open(connection);
            port.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);

            SerialInputOutputManager ioManager = new SerialInputOutputManager(port, new SerialInputOutputManager.Listener() {
                @Override
                public void onNewData(byte[] data) {
                    JSObject event = new JSObject();
                    if ("flashData".equals(dataEvent)) {
                        event.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
                    } else {
                        event.put("data", new String(data, StandardCharsets.UTF_8));
                    }
                    notifyListeners(dataEvent, event);
                }

                @Override
                public void onRunError(Exception error) {
                    JSObject event = new JSObject();
                    event.put("message", error.getMessage() == null ? "Serial connection stopped." : error.getMessage());
                    notifyListeners("serialError", event);
                }
            });
            ioManager.start();

            serialConnection = connection;
            serialPort = port;
            serialIoManager = ioManager;
            connectedDeviceId = device.getDeviceId();
            activeDataEvent = dataEvent;

            JSObject result = toDeviceDetails(driver);
            result.put("baudRate", baudRate);
            call.resolve(result);
        } catch (IOException error) {
            try {
                port.close();
            } catch (IOException ignored) {
                // The original open/configuration error is more useful to the learner.
            }
            connection.close();
            call.reject("Could not open the " + connectionName + ": " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void writeFlash(PluginCall call) {
        if (serialPort == null || !"flashData".equals(activeDataEvent)) {
            call.reject("Open the ESP32 flashing connection first.");
            return;
        }

        String encodedData = call.getString("data");
        if (encodedData == null || encodedData.isEmpty()) {
            call.reject("Flash data is missing.");
            return;
        }

        try {
            serialPort.write(Base64.decode(encodedData, Base64.DEFAULT), 5_000);
            call.resolve();
        } catch (IOException error) {
            call.reject("Could not send data to the ESP32: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void setFlashSignals(PluginCall call) {
        if (serialPort == null || !"flashData".equals(activeDataEvent)) {
            call.reject("Open the ESP32 flashing connection first.");
            return;
        }

        try {
            if (call.hasOption("dataTerminalReady")) {
                serialPort.setDTR(call.getBoolean("dataTerminalReady", false));
            }
            if (call.hasOption("requestToSend")) {
                serialPort.setRTS(call.getBoolean("requestToSend", false));
            }
            call.resolve();
        } catch (IOException error) {
            call.reject("Could not set the ESP32 boot signals: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void setFlashBaudRate(PluginCall call) {
        if (serialPort == null || !"flashData".equals(activeDataEvent)) {
            call.reject("Open the ESP32 flashing connection first.");
            return;
        }

        int baudRate = call.getInt("baudRate", 115200);
        if (baudRate <= 0) {
            call.reject("Choose a valid baud rate.");
            return;
        }

        try {
            serialPort.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            call.resolve();
        } catch (IOException error) {
            call.reject("Could not change the ESP32 connection speed: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void closeSerial(PluginCall call) {
        closeSerialConnection();
        call.resolve();
    }

    @PluginMethod
    public void closeFlashPort(PluginCall call) {
        closeSerialConnection();
        call.resolve();
    }

    private UsbDevice findDevice(int deviceId) {
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            if (device.getDeviceId() == deviceId) {
                return device;
            }
        }
        return null;
    }

    private void closeSerialConnection() {
        if (serialIoManager != null) {
            serialIoManager.stop();
            serialIoManager = null;
        }
        if (serialPort != null) {
            try {
                // Release GPIO0 and EN before the USB bridge closes. A CP2102
                // can otherwise leave a classic ESP32 in download/reset mode
                // until the OTG cable is disconnected.
                serialPort.setDTR(false);
                serialPort.setRTS(false);
            } catch (IOException ignored) {
                // The port may already be gone; still close its remaining resources.
            }
            try {
                serialPort.close();
            } catch (IOException ignored) {
                // There is nothing else to close if the cable has already been removed.
            }
            serialPort = null;
        }
        if (serialConnection != null) {
            serialConnection.close();
            serialConnection = null;
        }
        connectedDeviceId = -1;
        activeDataEvent = "serialData";
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
