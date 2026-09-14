package com.evopay.carwash.pos;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the printer plugin by its class as required by Capacitor 3+
        registerPlugin(TelpoPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "TelpoPrinter")
    public static class TelpoPrinterPlugin extends Plugin {
        private static final String TAG = "TelpoPrinter";
        private Object printerService = null;
        private boolean isBound = false;

        private final ServiceConnection printerConnection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder service) {
                Log.d(TAG, "Printer service connected");
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
        public void load() {
            super.load();
            bindPrinterService();
        }

        private void bindPrinterService() {
            try {
                Intent intent = new Intent();
                intent.setAction("com.iposprinter.iposprinterservice.IPosPrintService");
                intent.setPackage("com.iposprinter.iposprinterservice");
                getContext().bindService(intent, printerConnection, Context.BIND_AUTO_CREATE);
                Log.d(TAG, "Binding to iPosPrinter service...");
            } catch (Exception e) {
                Log.e(TAG, "Failed to bind printer service", e);
            }
        }

        @Override
        protected void handleOnDestroy() {
            if (isBound) {
                try {
                    getContext().unbindService(printerConnection);
                } catch (Exception e) {
                    Log.e(TAG, "Error unbinding", e);
                }
            }
            super.handleOnDestroy();
        }

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
                Class<?> serviceClass = printerService.getClass();
                Class<?> callbackClass = Class.forName("com.iposprinter.iposprinterservice.IPosPrinterCallback");

                // printerInit
                java.lang.reflect.Method printerInit = serviceClass.getMethod("printerInit", callbackClass);
                printerInit.invoke(printerService, new Object[]{null});

                // sendStringData
                java.lang.reflect.Method sendStringData = serviceClass.getMethod("sendStringData", String.class, callbackClass);
                sendStringData.invoke(printerService, text, null);

                // printNewline
                java.lang.reflect.Method printNewline = serviceClass.getMethod("printNewline", callbackClass);
                printNewline.invoke(printerService, new Object[]{null});

                // performPrint
                java.lang.reflect.Method performPrint = serviceClass.getMethod("performPrint", int.class, callbackClass);
                performPrint.invoke(printerService, 1, null); // 1 = feed & cut

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Print failed", e);
                call.reject("Print failed: " + e.getMessage());
            }
        }
    }
}
