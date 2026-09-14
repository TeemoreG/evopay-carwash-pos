// Printing abstraction: Network → Web Serial → WebUSB → Browser fallback
// Config source of truth: backend settings table (flat keys)
// Cached in localStorage for instant reads.

const LS_KEY = 'printer_config';
const DEFAULT_CONFIG = {
  mode: 'browser',
  networkIp: '',
  networkPort: 9100,
  vendorId: null,
  productId: null,
  width: 80,
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

// QR via GS ( k — standard ESC/POS 2D barcode commands.
// Most 58mm/80mm thermal printers support this. If printer ignores it, no harm.
function escposQR(url) {
  const bytes = [];
  const data = enc(url);
  const len = data.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;

  // Model 2
  bytes.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  // Module size = 6 dots
  bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
  // Error correction level M
  bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  // Store data
  bytes.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...data);
  // Print stored data
  bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  return bytes;
}

// KRA eTIMS verification URL — standard format
function buildKraQrUrl(sale) {
  const cuId = sale.cuId || 'KRACU0300003735';
  const cuReceiptNumber = sale.invoice_no || '';
  const internalData = sale.internal_data || '';
  const signature = sale.vscu_signature || '';
  const d = new Date(sale.created_at || sale.date || Date.now());
  const invoiceDate =
    String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    d.getFullYear();
  const invoiceTime =
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');

  const payload = `${invoiceDate}#${invoiceTime}#${cuId}#${cuReceiptNumber}#${internalData}#${signature}`;
  // KRA verification portal
  return `https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceipt?qrCode=${encodeURIComponent(payload)}`;
}

function isSigned(sale) {
  return sale.synced === 1 && !!sale.vscu_signature;
}

export function buildEscPos(sale, width = 80) {
  const chars = width === 58 ? 32 : 42;
  const out = [];
  const push = (...b) => out.push(...b);

  // Text helpers
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

  // ESC/POS control helpers
  const boldOn = () => push(ESC, 0x45, 0x01);
  const boldOff = () => push(ESC, 0x45, 0x00);
  const sizeNormal = () => push(ESC, 0x21, 0x00);
  const sizeDH = () => push(ESC, 0x21, 0x10); // double height
  const sizeDWH = () => push(ESC, 0x21, 0x30); // double width + height
  const alignCenter = () => push(ESC, 0x61, 0x01);
  const alignLeft = () => push(ESC, 0x61, 0x00);
  const setLineSpacing = () => push(ESC, 0x33, 0x28); // ~40 dots
  const resetLineSpacing = () => push(ESC, 0x32);

  // ---------- Init ----------
  push(ESC, 0x40); // reset
  setLineSpacing();

  // ---------- Header ----------
  alignCenter();
  boldOn();
  sizeDWH();
  line('EVOPAY CAR WASH');
  sizeDH();
  line('eTIMS Compliant Receipt');
  sizeNormal();
  boldOff();

  // KRA PIN from env
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';
  if (kraPin) {
    line(`PIN: ${kraPin}`);
  }
  push(0x0a); // blank line

  alignLeft();
  boldOn();
  sizeDH();
  line(`Invoice: ${sale.invoice_no || 'N/A'}`);
  sizeNormal();
  boldOff();

  hr('=');
  boldOn();
  rowLR('Cashier:', sale.user_name || sale.cashier || 'Unknown');
  rowLR('Customer:', sale.customer || 'Walk-in');
  rowLR('Date:', new Date(sale.created_at || Date.now()).toLocaleString());
  rowLR('Payment:', paymentLabel(sale));
  if (sale.customer_pin && sale.customer_pin !== 'N/A') {
    rowLR('PIN:', sale.customer_pin);
  }
  boldOff();
  hr();

  // ---------- Items (4-column layout) ----------
  boldOn();
  const nameW = chars - 3 - 6 - 7 - 8; // 58mm -> ~8 chars is tight; keep as-is
  line('ITEM'.padEnd(nameW) + 'QTY'.padStart(3) + 'PRC'.padStart(7) + 'TOT'.padStart(9));
  boldOff();
  hr();

  (sale.items || []).forEach((it) => {
    const name = (it.item_name || it.name || 'Item').slice(0, nameW);
    const qty = String(it.quantity || 0).padStart(3);
    const price = Number(it.price || 0).toFixed(0).padStart(7);
    const total = (Number(it.price || 0) * Number(it.quantity || 0))
      .toFixed(0)
      .padStart(9);
    line(name.padEnd(nameW) + qty + price + total);
  });

  hr();

  // ---------- Totals ----------
  boldOn();
  rowLR('Subtotal:', `KES ${Number(sale.subtotal || 0).toFixed(2)}`);
  rowLR('VAT (16%):', `KES ${Number(sale.tax || 0).toFixed(2)}`);
  sizeDH();
  rowLR('TOTAL:', `KES ${Number(sale.total || 0).toFixed(2)}`);
  sizeNormal();
  boldOff();
  hr('=');

  // ---------- Verification block ----------
  alignCenter();
  if (isSigned(sale)) {
    boldOn();
    line('KRA eTIMS Verified');
    boldOff();
    push(0x0a);
    // QR — only for signed receipts
    const qrUrl = buildKraQrUrl(sale);
    push(...escposQR(qrUrl));
    push(0x0a);
    line('Scan to verify on KRA');
  } else {
    // Unsigned — no KRA QR, no KRA name
    line('Pending eTIMS sync');
    line('Receipt not yet verified');
  }
  push(0x0a);

  // ---------- Footer ----------
  sizeNormal();
  const dateStamp = new Date().toISOString();
  line(`SCU: ${sale.scuId || 'EVO-VSCU-001'}`);
  line(`CU:  ${sale.cuId || `CU-${String(Date.now()).slice(-6)}`}`);
  line(`Printed: ${dateStamp}`);
  hr();
  boldOn();
  line('Thank you for your business!');
  boldOff();
  line('KRA eTIMS VSCU v2.0.21');
  push(0x0a, 0x0a, 0x0a);

  // ---------- Cut ----------
  resetLineSpacing();
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
    vscu_signature: 'TEST_SIGNATURE',
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