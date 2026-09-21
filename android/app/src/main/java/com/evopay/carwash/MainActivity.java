package com.evopay.carwash;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TelpoPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "TelpoPrinter")
    public static class TelpoPrinterPlugin extends Plugin {
        private static final String TAG = "TelpoPrinter";

        private Object printerService = null;
        private Object printerCallback = null;
        private boolean isBound = false;
        private boolean isInitialized = false;
        private int bindAttempts = 0;
        private static final int MAX_BIND_ATTEMPTS = 5;

        // ==================== Service connection ====================
        private final ServiceConnection printerConnection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder service) {
                Log.d(TAG, "onServiceConnected");
                try {
                    Class<?> stubClass = Class.forName(
                        "com.iposprinter.iposprinterservice.IPosPrinterService$Stub"
                    );
                    Method asInterface = stubClass.getMethod("asInterface", IBinder.class);
                    printerService = asInterface.invoke(null, service);
                    isBound = true;
                    bindAttempts = 0;
                    Log.d(TAG, "Printer service bound successfully");

                    createCallbackProxy();
                    tryInitPrinter();
                } catch (Exception e) {
                    Log.e(TAG, "Bind failed", e);
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                Log.d(TAG, "onServiceDisconnected");
                printerService = null;
                isBound = false;
                isInitialized = false;
            }
        };

        // ==================== Callback proxy ====================
        private void createCallbackProxy() {
            try {
                Class<?> callbackInterface = Class.forName(
                    "com.iposprinter.iposprinterservice.IPosPrinterCallback"
                );
                printerCallback = Proxy.newProxyInstance(
                    callbackInterface.getClassLoader(),
                    new Class<?>[]{ callbackInterface },
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) {
                            try {
                                String name = method.getName();
                                if ("onRunResult".equals(name) || "onReturnString".equals(name)) {
                                    Object arg = (args != null && args.length > 0) ? args[0] : null;
                                    Log.d(TAG, "Callback " + name + ": " + arg);
                                }
                            } catch (Exception ex) {
                                Log.e(TAG, "Callback error", ex);
                            }
                            return null;
                        }
                    }
                );
                Log.d(TAG, "Callback proxy created");
            } catch (Exception e) {
                Log.e(TAG, "Failed to create callback proxy", e);
            }
        }

        // ==================== Load / Unload ====================
        @Override
        public void load() {
            super.load();
            bindPrinterService();
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

        // ==================== Service bind with retry ====================
        private void bindPrinterService() {
            if (isBound) return;
            try {
                Intent intent = new Intent();
                intent.setAction("com.iposprinter.iposprinterservice.IPosPrintService");
                intent.setPackage("com.iposprinter.iposprinterservice");

                boolean ok = getContext().bindService(
                    intent, printerConnection, Context.BIND_AUTO_CREATE
                );
                Log.d(TAG, "bindService returned: " + ok);

                if (!ok && bindAttempts < MAX_BIND_ATTEMPTS) {
                    bindAttempts++;
                    Log.d(TAG, "Retry bind attempt " + bindAttempts);
                    final int delay = 1000 * bindAttempts;
                    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                        new Runnable() {
                            @Override public void run() { bindPrinterService(); }
                        },
                        delay
                    );
                }
            } catch (Exception e) {
                Log.e(TAG, "bindPrinterService exception", e);
            }
        }

        // ==================== Init printer ====================
        private void tryInitPrinter() {
            if (!isBound || printerService == null || isInitialized) return;
            try {
                Class<?> cbClass = Class.forName(
                    "com.iposprinter.iposprinterservice.IPosPrinterCallback"
                );
                Method init = printerService.getClass().getMethod("printerInit", cbClass);
                init.invoke(printerService, printerCallback);
                isInitialized = true;
                Log.d(TAG, "printerInit success");
            } catch (Exception e) {
                Log.e(TAG, "printerInit failed", e);
            }
        }

        private Class<?> getCallbackClass() throws ClassNotFoundException {
            return Class.forName("com.iposprinter.iposprinterservice.IPosPrinterCallback");
        }

        // ==================== Public API ====================

        @PluginMethod
        public void isReady(PluginCall call) {
            JSObject ret = new JSObject();
            ret.put("ready", isBound && printerService != null);
            ret.put("initialized", isInitialized);
            call.resolve(ret);
        }

        @PluginMethod
        public void printText(PluginCall call) {
            String text = call.getString("text", "");
            if (text == null || text.isEmpty()) {
                call.reject("No text provided");
                return;
            }
            if (!isBound || printerService == null) {
                call.reject("Printer service not bound. Check that the Telpo printer service is running.");
                return;
            }

            try {
                Class<?> cbClass = getCallbackClass();

                if (!isInitialized) {
                    tryInitPrinter();
                }

                // Send raw string
                Method sendStringData = printerService.getClass().getMethod(
                    "sendStringData", String.class, cbClass
                );
                sendStringData.invoke(printerService, text, printerCallback);

                // Line feeds
                Method printNewline = printerService.getClass().getMethod(
                    "printNewline", cbClass
                );
                printNewline.invoke(printerService, printerCallback);
                printNewline.invoke(printerService, printerCallback);

                // Feed + cut (try int-arg variant first, then no-arg)
                try {
                    Method performPrint = printerService.getClass().getMethod(
                        "performPrint", int.class, cbClass
                    );
                    performPrint.invoke(printerService, 1, printerCallback);
                } catch (NoSuchMethodException nsme) {
                    try {
                        Method performPrint = printerService.getClass().getMethod(
                            "performPrint", cbClass
                        );
                        performPrint.invoke(printerService, printerCallback);
                    } catch (Exception ex) {
                        Log.w(TAG, "performPrint not found, skipping feed/cut", ex);
                    }
                }

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "printText failed", e);
                call.reject("Print failed: " + e.getMessage());
            }
        }
    }
}