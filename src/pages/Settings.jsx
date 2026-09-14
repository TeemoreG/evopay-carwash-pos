import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getSettings, updateSettings, checkVSCUStatus } from '../api/vscuApi';
import {
  getCachedConfig,
  setCachedConfig,
  configToFlat,
  testPrint,
  detectAvailableMethods,
} from '../utils/printer';

const DEFAULT_PRINTER = {
  mode: 'browser',
  networkIp: '',
  networkPort: 9100,
  vendorId: null,
  productId: null,
  width: 80,
};

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [methods] = useState(detectAvailableMethods());
  const [printer, setPrinter] = useState(DEFAULT_PRINTER);
  const [settings, setSettings] = useState({
    company_name: 'Evopay Limited',
    company_pin: import.meta.env.VITE_VSCU_TIN,
    branch_id: import.meta.env.VITE_VSCU_BHF_ID,
    default_customer: 'Walk-in Customer',
    low_stock_threshold: '5',
    receipt_footer: 'Thank you for your business',
    auto_print: 'yes',
    default_tax: 'B',
  });

  useEffect(() => {
    setPrinter(getCachedConfig());
    fetchSettings();
    checkVSCU();
  }, []);

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await getSettings();
      if (response.data) {
        setSettings((prev) => ({ ...prev, ...response.data }));
        // Rebuild printer config from flat keys
        const flat = response.data;
        setPrinter((prev) => ({
          ...prev,
          mode: flat.printer_mode || prev.mode,
          networkIp: flat.printer_network_ip ?? prev.networkIp,
          networkPort: flat.printer_network_port ? Number(flat.printer_network_port) : prev.networkPort,
          vendorId: flat.printer_vendor_id ? Number(flat.printer_vendor_id) : prev.vendorId,
          productId: flat.printer_product_id ? Number(flat.printer_product_id) : prev.productId,
          width: flat.printer_width ? Number(flat.printer_width) : prev.width,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('Error loading settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings({ ...settings, [name]: value });
  };

  const handlePrinterChange = (e) => {
    const { name, value } = e.target;
    setPrinter((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'networkPort' || name === 'width') next[name] = Number(value);
      if (name === 'vendorId' || name === 'productId') next[name] = value ? Number(value) : null;
      return next;
    });
  };

  const handleTestPrint = async () => {
    if (printer.mode === 'browser') {
      toast.info('Browser mode does not need a test — Print opens the PDF dialog.');
      return;
    }
    setTesting(true);
    try {
      await testPrint(printer);
      toast.success('Test print sent to printer');
    } catch (err) {
      console.error('Test print failed:', err);
      toast.error('Test print failed: ' + (err.message || 'Unknown'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      localStorage.setItem('tin', settings.company_pin);
      localStorage.setItem('bhfId', settings.branch_id);
      localStorage.setItem('defaultCustomer', settings.default_customer);
      localStorage.setItem('receiptFooter', settings.receipt_footer);
      localStorage.setItem('autoPrint', settings.auto_print);
      localStorage.setItem('defaultTax', settings.default_tax);
      localStorage.setItem('lowStockThreshold', settings.low_stock_threshold);

      // Merge flat printer keys into settings payload
      const payload = { ...settings, ...configToFlat(printer) };
      await updateSettings(payload);

      // Update cache so printer.js picks it up immediately
      setCachedConfig(printer);

      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      setSettings({
        company_name: 'Evopay Limited',
        company_pin: import.meta.env.VITE_VSCU_TIN,
        branch_id: import.meta.env.VITE_VSCU_BHF_ID,
        default_customer: 'Walk-in Customer',
        low_stock_threshold: '5',
        receipt_footer: 'Thank you for your business',
        auto_print: 'yes',
        default_tax: 'B',
      });
      setPrinter(DEFAULT_PRINTER);
      toast.info('Settings reset to defaults');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a]">Settings</h1>
          <p className="text-gray-500 text-sm">Configure your cashier system</p>
        </div>
      </div>

      {/* VSCU Status Bar */}
      <div className="flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
        <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className="text-xs font-medium text-gray-600">
          VSCU: {vscuOnline ? 'Online' : 'Offline'}
        </span>
        <div className="h-4 w-px bg-gray-200"></div>
        <span className="text-xs text-gray-400">Settings are applied locally</span>
        {!vscuOnline && (
          <span className="text-xs text-yellow-600 ml-auto">(VSCU offline - settings still apply)</span>
        )}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Company Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-[#1a2a4a] mb-4">Company Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                <input
                  type="text"
                  name="company_name"
                  value={settings.company_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Shows on receipts</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KRA PIN</label>
                <input
                  type="text"
                  name="company_pin"
                  value={settings.company_pin}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., P600003965A"
                />
                <p className="text-xs text-gray-400 mt-1">Used in all VSCU API requests</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch ID</label>
                <input
                  type="text"
                  name="branch_id"
                  value={settings.branch_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., 00"
                />
                <p className="text-xs text-gray-400 mt-1">Your branch/location identifier</p>
              </div>
            </div>
          </div>

          {/* Cashier Preferences */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-[#1a2a4a] mb-4">Cashier Preferences</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Customer Name</label>
                <input
                  type="text"
                  name="default_customer"
                  value={settings.default_customer}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="Walk-in Customer"
                />
                <p className="text-xs text-gray-400 mt-1">Auto-fills customer name on new sale</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Tax Type</label>
                <select
                  name="default_tax"
                  value={settings.default_tax}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="A">A - Exempt (0%)</option>
                  <option value="B">B - Standard (16%)</option>
                  <option value="C">C - Zero Rated (0%)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Default tax type when adding items</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Print Receipt</label>
                <select
                  name="auto_print"
                  value={settings.auto_print}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="yes">Yes (Auto-print after sale)</option>
                  <option value="no">No (Show receipt only)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Automatically print receipt after sale</p>
              </div>
            </div>
          </div>

          {/* Stock & Receipt */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-[#1a2a4a] mb-4">Stock & Receipt</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert Level</label>
                <input
                  type="number"
                  name="low_stock_threshold"
                  value={settings.low_stock_threshold}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="5"
                  min="1"
                />
                <p className="text-xs text-gray-400 mt-1">Alert when stock drops below this number</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Footer Message</label>
                <input
                  type="text"
                  name="receipt_footer"
                  value={settings.receipt_footer}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="Thank you for your business"
                />
                <p className="text-xs text-gray-400 mt-1">Shows at bottom of every receipt</p>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-600 font-medium">System Information</p>
              <div className="mt-3 space-y-1 text-xs text-gray-400">
                <p>VSCU Status: <span className={vscuOnline ? 'text-green-600' : 'text-red-600'}>
                  {vscuOnline ? 'Online' : 'Offline'}
                </span></p>
                <p>Settings saved locally</p>
                <p>Changes take effect immediately</p>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400">KRA eTIMS Compliant</p>
                  <p className="text-xs text-gray-400">v2.0.21</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Printer — full-width card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-[#1a2a4a]">Printer</h2>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded ${methods.network ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Network</span>
              <span className={`px-2 py-0.5 rounded ${methods.serial ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Web Serial</span>
              <span className={`px-2 py-0.5 rounded ${methods.usb ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>WebUSB</span>
              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">Browser</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Print Mode</label>
              <select
                name="mode"
                value={printer.mode}
                onChange={handlePrinterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
              >
                <option value="network">Network (TCP/IP :9100) — recommended</option>
                <option value="serial">Web Serial (USB / COM)</option>
                <option value="usb">WebUSB (raw USB printer)</option>
                <option value="browser">Browser (PDF print dialog)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Tries the configured method; falls back to PDF if it fails.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paper Width</label>
              <select
                name="width"
                value={printer.width}
                onChange={handlePrinterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
              >
                <option value={80}>80mm (42 chars)</option>
                <option value={58}>58mm (32 chars)</option>
              </select>
            </div>

            {printer.mode === 'network' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Printer IP</label>
                  <input
                    type="text"
                    name="networkIp"
                    value={printer.networkIp}
                    onChange={handlePrinterChange}
                    placeholder="192.168.1.50"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input
                    type="number"
                    name="networkPort"
                    value={printer.networkPort}
                    onChange={handlePrinterChange}
                    placeholder="9100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  />
                </div>
              </>
            )}

            {printer.mode === 'usb' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor ID (decimal)</label>
                  <input
                    type="number"
                    name="vendorId"
                    value={printer.vendorId ?? ''}
                    onChange={handlePrinterChange}
                    placeholder="e.g. 1208"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product ID (decimal)</label>
                  <input
                    type="number"
                    name="productId"
                    value={printer.productId ?? ''}
                    onChange={handlePrinterChange}
                    placeholder="e.g. 514"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  />
                </div>
              </>
            )}

            {printer.mode === 'serial' && (
              <div className="md:col-span-2 bg-blue-50 border border-blue-100 text-blue-800 text-xs rounded-lg p-3">
                First print will prompt you to select the COM port. Chrome remembers it per-origin after that.
              </div>
            )}

            {printer.mode === 'browser' && (
              <div className="md:col-span-2 bg-gray-50 border border-gray-100 text-gray-600 text-xs rounded-lg p-3">
                Printing will open the browser PDF dialog. No native printer required.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-gray-100">
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={testing || printer.mode === 'browser'}
              className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                  </svg>
                  Testing...
                </>
              ) : (
                'Test Print'
              )}
            </button>
            <p className="text-xs text-gray-400">
              Test uses current form values — no need to save first.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-6 py-2 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            onClick={fetchSettings}
            className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-4 py-2 rounded-lg transition"
          >
            Refresh
          </button>
        </div>
      </form>

      <div className="mt-4 text-xs text-gray-400 text-center">
        Changes take effect immediately
      </div>
    </div>
  );
};

export default Settings;