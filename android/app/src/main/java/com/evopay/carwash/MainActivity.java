package com.evopay.carwash.pos;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "TelpoPrinter";
    private Object printerService = null; // Will hold IPosPrinterService
    private boolean isBound = false;

    // ServiceConnection to bind to the printer AIDL
    private final ServiceConnection printerConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "Printer service connected");
            // Use reflection to get the Stub.asInterface since we don't have the AIDL compiled
            try {
                Class<?> stubClass = Class.forName("com.iposprinter.iposprinterservice.IPosPrinterService$Stub");
                java.lang.reflect.Method asInterface = stubClass.getMethod("asInterface", IBinder.class);
                printerService = asInterface.invoke(null, service);
                isBound = true;
                Log.d(TAG, "Printer bound successfully");
            } catch (Exception e) {
                Log.e(TAG, "Failed to bind printer service", e);
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "Printer service disconnected");
            printerService = null;
            isBound = false;
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(new Plugin() {
            @PluginMethod
            public void printText(PluginCall call) {
                String text = call.getString("text", "");
                if (text.isEmpty()) {
                    call.reject("No text provided");
                    return;
                }
                if (!isBound || printerService == null) {
                    call.reject("Printer not connected. Ensure iPosPrinter service is running.");
                    return;
                }
                try {
                    // Use reflection to call printer methods
                    Class<?> serviceClass = printerService.getClass();

                    // printerInit
                    java.lang.reflect.Method printerInit = serviceClass.getMethod("printerInit", 
                        Class.forName("com.iposprinter.iposprinterservice.IPosPrinterCallback"));
                    printerInit.invoke(printerService, new Object[]{null});

                    // sendStringData
                    java.lang.reflect.Method sendStringData = serviceClass.getMethod("sendStringData", 
                        String.class, Class.forName("com.iposprinter.iposprinterservice.IPosPrinterCallback"));
                    sendStringData.invoke(printerService, text, null);

                    // printNewline
                    java.lang.reflect.Method printNewline = serviceClass.getMethod("printNewline", 
                        Class.forName("com.iposprinter.iposprinterservice.IPosPrinterCallback"));
                    printNewline.invoke(printerService, new Object[]{null});

                    // performPrint
                    java.lang.reflect.Method performPrint = serviceClass.getMethod("performPrint", 
                        int.class, Class.forName("com.iposprinter.iposprinterservice.IPosPrinterCallback"));
                    performPrint.invoke(printerService, 1, null); // 1 = feed & cut

                    call.resolve();
                } catch (Exception e) {
                    Log.e(TAG, "Print failed", e);
                    call.reject("Print failed: " + e.getMessage());
                }
            }
        });

        super.onCreate(savedInstanceState);

        // Bind to the iPosPrinter service (used by Telpo TPS900)
        try {
            Intent intent = new Intent();
            intent.setAction("com.iposprinter.iposprinterservice.IPosPrintService");
            intent.setPackage("com.iposprinter.iposprinterservice");
            bindService(intent, printerConnection, Context.BIND_AUTO_CREATE);
            Log.d(TAG, "Binding to iPosPrinter service...");
        } catch (Exception e) {
            Log.e(TAG, "Failed to bind printer service", e);
        }
    }

    @Override
    public void onDestroy() {
        if (isBound) {
            try {
                unbindService(printerConnection);
            } catch (Exception e) {
                Log.e(TAG, "Error unbinding", e);
            }
        }
        super.onDestroy();
    }
}