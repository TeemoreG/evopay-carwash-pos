// Printing abstraction: Network → Web Serial → WebUSB → Browser fallback
// Config source of truth: backend settings table (flat keys)
// Cached in localStorage for instant reads.

const LS_KEY = 'printer_config';
const DEFAULT_CONFIG = {
  mode: 'browser',       // 'network' | 'serial' | 'usb' | 'browser'
  networkIp: '',
  networkPort: 9100,
  vendorId: null,
  productId: null,
  width: 80,             // 58 or 80 (mm)
};

// ---------- Config ----------
export function getCachedConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setCachedConfig(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {}
}

// Backend <-> flat-keys mapping
function flatToConfig(flat) {
  const cfg = { ...DEFAULT_CONFIG };
  if (flat.printer_mode) cfg.mode = flat.printer_mode;
  if (flat.printer_network_ip) cfg.networkIp = flat.printer_network_ip;
  if (flat.printer_network_port) cfg.networkPort = Number(flat.printer_network_port) || 9100;
  if (flat.printer_vendor_id) cfg.vendorId = Number(flat.printer_vendor_id) || null;
  if (flat.printer_product_id) cfg.productId = Number(flat.printer_product_id) || null;
  if (flat.printer_width) cfg.width = Number(flat.printer_width) || 80;
  return cfg;
}

export function configToFlat(cfg) {
  return {
    printer_mode: cfg.mode || 'browser',
    printer_network_ip: cfg.networkIp || '',
    printer_network_port: String(cfg.networkPort || 9100),
    printer_vendor_id: cfg.vendorId != null ? String(cfg.vendorId) : '',
    printer_product_id: cfg.productId != null ? String(cfg.productId) : '',
    printer_width: String(cfg.width || 80),
  };
}

export async function fetchPrinterConfig() {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const flat = await res.json();
    const cfg = flatToConfig(flat);
    setCachedConfig(cfg);
    return cfg;
  } catch (e) {
    console.warn('printer: failed to fetch config, using cache', e);
    return getCachedConfig();
  }
}

// ---------- ESC/POS byte builder ----------
const ESC = 0x1b;
const GS = 0x1d;

function enc(str) {
  return Array.from(str).map((c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 0x3f));
}

export function buildEscPos(sale, width = 80) {
  const chars = width === 58 ? 32 : 42;
  const out = [];
  const push = (...b) => out.push(...b);
  const line = (s = '') => push(...enc(s + '\n'));
  const hr = (c = '-') => line(c.repeat(chars));
  const center = (s) => {
    const pad = Math.max(0, Math.floor((chars - s.length) / 2));
    line(' '.repeat(pad) + s);
  };
  const rowLR = (l, r) => {
    const space = Math.max(1, chars - l.length - r.length);
    line(l + ' '.repeat(space) + r);
  };

  push(ESC, 0x40);
  push(ESC, 0x61, 0x01);
  push(ESC, 0x21, 0x30);
  center('EVOPAY CAR WASH');
  push(ESC, 0x21, 0x00);
  center('eTIMS Compliant Receipt');
  push(ESC, 0x61, 0x00);

  hr('=');
  rowLR('Invoice:', sale.invoice_no || 'N/A');
  rowLR('Cashier:', sale.user_name || sale.cashier || 'Unknown');
  rowLR('Customer:', sale.customer || 'Walk-in');
  rowLR('Date:', new Date(sale.created_at || Date.now()).toLocaleString());
  rowLR('Payment:', paymentLabel(sale));
  if (sale.customer_pin && sale.customer_pin !== 'N/A') {
    rowLR('PIN:', sale.customer_pin);
  }
  hr();

  const nameW = chars - 3 - 6 - 7 - 8;
  line('ITEM'.padEnd(nameW) + 'QTY'.padStart(3) + 'PRC'.padStart(7) + 'TOT'.padStart(9));
  hr();

  (sale.items || []).forEach((it) => {
    const name = (it.item_name || it.name || 'Item').slice(0, nameW);
    const qty = String(it.quantity || 0).padStart(3);
    const price = Number(it.price || 0).toFixed(0).padStart(7);
    const total = (Number(it.price || 0) * Number(it.quantity || 0)).toFixed(0).padStart(9);
    line(name.padEnd(nameW) + qty + price + total);
  });

  hr();
  rowLR('Subtotal:', `KES ${Number(sale.subtotal || 0).toFixed(2)}`);
  rowLR('VAT (16%):', `KES ${Number(sale.tax || 0).toFixed(2)}`);
  push(ESC, 0x21, 0x10);
  rowLR('TOTAL:', `KES ${Number(sale.total || 0).toFixed(2)}`);
  push(ESC, 0x21, 0x00);
  hr('=');

  center(sale.synced === 1 ? 'KRA eTIMS Verified' : 'Pending VSCU Sync');
  line('');
  center('Thank you for your business!');
  center('KRA eTIMS VSCU v2.0.21');
  line('');
  line('');
  line('');

  push(GS, 0x56, 0x00);
  return new Uint8Array(out);
}

function paymentLabel(sale) {
  const m = String(sale.payment_method || sale.pmtTyCd || '').trim();
  if (m === '01' || m === '1') return 'Cash';
  if (m === '02' || m === '2') return 'Card';
  if (m === '03' || m === '3') return 'M-Pesa';
  return m || 'Cash';
}

// ---------- Transports ----------
async function printNetwork(bytes, cfg) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/print/tcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ip: cfg.networkIp,
      port: Number(cfg.networkPort) || 9100,
      data: Array.from(bytes),
    }),
  });
  if (!res.ok) throw new Error(`Network print failed: HTTP ${res.status}`);
  return true;
}

async function printSerial(bytes) {
  if (!('serial' in navigator)) throw new Error('Web Serial not supported');
  let port = await navigator.serial.getPorts().then((p) => p[0]);
  if (!port) port = await navigator.serial.requestPort();
  if (!port.readable && !port.writable) await port.open({ baudRate: 9600 });
  const writer = port.writable.getWriter();
  await writer.write(bytes);
  writer.releaseLock();
  return true;
}

async function printUSB(bytes, cfg) {
  if (!('usb' in navigator)) throw new Error('WebUSB not supported');
  const devices = await navigator.usb.getDevices();
  let device = devices.find(
    (d) => d.vendorId === cfg.vendorId && d.productId === cfg.productId
  );
  if (!device) {
    device = await navigator.usb.requestDevice({
      filters: [{ vendorId: cfg.vendorId }],
    });
  }
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const iface = device.configuration.interfaces[0];
  await device.claimInterface(iface.interfaceNumber);
  const endpoint = iface.alternate.endpoints.find((e) => e.direction === 'out');
  await device.transferOut(endpoint.endpointNumber, bytes);
  return true;
}

// ---------- Public entry points ----------
export async function printBytes(bytes, cfg) {
  const config = cfg || getCachedConfig();
  if (config.mode === 'network') return printNetwork(bytes, config);
  if (config.mode === 'serial') return printSerial(bytes);
  if (config.mode === 'usb') return printUSB(bytes, config);
  throw new Error('No native printer mode configured');
}

export async function printReceipt(sale, cfg) {
  const config = cfg || getCachedConfig();
  const bytes = buildEscPos(sale, config.width);
  return printBytes(bytes, config);
}

// ---------- Settings helpers ----------
export async function testPrint(cfg) {
  const sample = {
    invoice_no: 'CW-TEST-0001',
    user_name: 'Test Cashier',
    customer: 'Test Customer',
    subtotal: 1000,
    tax: 160,
    total: 1160,
    synced: 1,
    items: [
      { item_name: 'Test Service', quantity: 1, price: 1000 },
    ],
  };
  const bytes = buildEscPos(sample, cfg.width);
  return printBytes(bytes, cfg);
}

export function detectAvailableMethods() {
  return {
    network: true,
    serial: typeof navigator !== 'undefined' && 'serial' in navigator,
    usb: typeof navigator !== 'undefined' && 'usb' in navigator,
    browser: true,
  };
}