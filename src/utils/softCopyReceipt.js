// src/utils/softCopyReceipt.js
// 80mm-wide soft-copy receipt — fits phones natively, prints on thermal.
// Modern, minimal, no distracting chrome.

import jsPDF from 'jspdf';
import QRCode from 'qrcode';

const BLACK = [0, 0, 0];
const BLUE = [0, 0, 0];
const ORANGE = [227, 89, 4];
const GREY = [110, 110, 110];
const LIGHT = [204, 204, 204];
const ROW_ALT = [245, 245, 245];
const WHITE = [255, 255, 255];
const GREEN = [5, 122, 5];
const AMBER = [227, 89, 4];

let cachedLogo = null;
let cachedLogoPromise = null;

const loadLogo = () => {
  if (cachedLogo) return Promise.resolve(cachedLogo);
  if (cachedLogoPromise) return cachedLogoPromise;
  cachedLogoPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { cachedLogo = img; resolve(img); };
    img.onerror = () => { cachedLogoPromise = null; resolve(null); };
    img.src = '/evopay-logo.jpg';
  });
  return cachedLogoPromise;
};

const paymentLabel = (sale) => {
  const m = String(sale.payment_method || '').trim();
  if (m === '01' || m === '1') return 'Cash';
  if (m === '02' || m === '2') return 'Card';
  if (m === '03' || m === '3') return 'M-Pesa';
  return m || 'N/A';
};

const isSigned = (sale) => sale?.synced === 1 && !!sale?.vscu_signature;

const buildQrTarget = (sale) => {
  if (isSigned(sale)) {
    const d = new Date(sale.created_at || sale.date || new Date().toISOString());
    const date = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
    const time = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    const cuId = sale.cuId || 'KRACU0300003735';
    const payload = `${date}#${time}#${cuId}#${sale.invoice_no || ''}#${sale.internal_data || ''}#${sale.vscu_signature || ''}`;
    return `https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceipt?qrCode=${encodeURIComponent(payload)}`;
  }
  const base = import.meta.env.VITE_PAYMENT_BASE_URL || window.location.origin;
  return `${base}/receipt/${encodeURIComponent(sale.invoice_no || '')}`;
};

const TZ = 'Africa/Nairobi';

const fmtDate = (s) => {
  if (!s) return 'N/A';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString('en-KE', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-KE', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const generateSoftCopyReceipt = async (sale) => {
  const pageW = 80;
  const items = sale.items || [];

  // Dynamic height — grows with items
  const baseHeight = 130;
  const perItem = 8;
  const qrBlock = 55;
  const pageH = baseHeight + items.length * perItem + qrBlock;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
    compress: true,
  });

  const margin = 6;
  const contentW = pageW - margin * 2;
  const rightX = pageW - margin;

  const logo = await loadLogo();
  const signed = isSigned(sale);
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';
  const subtotal = Number(sale.subtotal || 0);
  const tax = Number(sale.tax || 0);
  const total = Number(sale.total || 0);

  let y = margin + 2;

  if (logo) {
  const lw = contentW * 0.5;
  const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
  try {
    doc.addImage(logo, 'JPEG', (pageW - lw) / 2, y, lw, lh, undefined, 'FAST');
    y += lh + 2;
  } catch {}
}

  // ---- Business name ----
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...BLUE);
  doc.text('EVOPAY CAR WASH', pageW / 2, y, { align: 'center' });
  y += 5.5;

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
  doc.text('eTIMS Compliant Receipt', pageW / 2, y, { align: 'center' });
  y += 4;

  if (kraPin) {
    doc.text(`KRA PIN: ${kraPin}`, pageW / 2, y, { align: 'center' });
    y += 4;
  }

  // ---- Divider ----
  doc.setDrawColor(...BLUE).setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ---- Meta rows ----
  const metaRows = [
    ['Invoice', sale.invoice_no || 'N/A'],
    ['Date', `${fmtDate(sale.created_at || sale.date)}  ${fmtTime(sale.created_at || sale.date)}`],
    ['Cashier', sale.cashier || 'Unknown'],
    ['Customer', sale.customer || 'Walk-in'],
    ['Payment', paymentLabel(sale)],
  ];

  metaRows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
    doc.text(k, margin, y);
    doc.setFont('helvetica', 'bold').setTextColor(...BLACK);
    doc.text(String(v), rightX, y, { align: 'right' });
    y += 4;
  });

  y += 2;

  // ---- Items header ----
  doc.setFillColor(...BLUE);
  doc.rect(margin, y, contentW, 5.5, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...WHITE);

  const colQtyX = margin + contentW - 32;
  const colPriceX = margin + contentW - 18;
  const colTotalX = rightX - 1.5;

  doc.text('ITEM', margin + 1.5, y + 4);
  doc.text('QTY', colQtyX, y + 4, { align: 'right' });
  doc.text('PRICE', colPriceX, y + 4, { align: 'right' });
  doc.text('TOTAL', colTotalX, y + 4, { align: 'right' });
  y += 5.5;

  // ---- Item rows ----
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...BLACK);
  items.forEach((it, idx) => {
    const name = it.item_name || it.name || 'Unknown';
    const qty = Number(it.quantity || 0);
    const price = Number(it.price || 0);
    const amount = Number(it.total || qty * price);

    const nameWidth = colQtyX - margin - 6;
    const lines = doc.splitTextToSize(name, nameWidth);
    const rowH = Math.max(5, lines.length * 3.2 + 1.5);

    if (idx % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, contentW, rowH, 'F');
    }

    doc.setTextColor(...BLACK);
    doc.text(lines, margin + 1.5, y + 3.5);
    doc.text(String(qty), colQtyX, y + 3.5, { align: 'right' });
    doc.text(price.toFixed(2), colPriceX, y + 3.5, { align: 'right' });
    doc.text(amount.toFixed(2), colTotalX, y + 3.5, { align: 'right' });
    y += rowH;
  });

  // ---- Divider ----
  doc.setDrawColor(...BLUE).setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // ---- Totals ----
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY);
  doc.text('Subtotal', margin, y);
  doc.setTextColor(...BLACK);
  doc.text(`KES ${subtotal.toFixed(2)}`, rightX, y, { align: 'right' });
  y += 4.5;

  doc.setTextColor(...GREY);
  doc.text('VAT (16%)', margin, y);
  doc.setTextColor(...BLACK);
  doc.text(`KES ${tax.toFixed(2)}`, rightX, y, { align: 'right' });
  y += 5.5;

  // ---- Grand total band ----
  doc.setFillColor(...BLUE);
  doc.rect(margin, y - 3.5, contentW, 8, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...WHITE);
  doc.text('TOTAL', margin + 1.5, y + 1.5);
  doc.text(`KES ${total.toFixed(2)}`, rightX - 1.5, y + 1.5, { align: 'right' });
  y += 12;

  // ---- QR ----
  try {
    const target = buildQrTarget(sale);
    const qrData = await QRCode.toDataURL(target, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
    const qrSize = 32;
    const qrX = (pageW - qrSize) / 2;
    doc.addImage(qrData, 'PNG', qrX, y, qrSize, qrSize, undefined, 'FAST');
    y += qrSize + 2;

    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GREY);
    doc.text(
      signed ? 'Scan to verify on KRA' : 'Scan to view receipt online',
      pageW / 2,
      y,
      { align: 'center' }
    );
    y += 5;
  } catch {}

  // ---- Status ----
  if (signed) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...GREEN);
    doc.text('KRA eTIMS VERIFIED', pageW / 2, y, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...AMBER);
    doc.text('NON-FISCAL RECEIPT', pageW / 2, y, { align: 'center' });
    y += 3.5;
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...GREY);
    doc.text('Pending eTIMS sync — not a KRA tax invoice', pageW / 2, y, { align: 'center' });
  }
  y += 5;

  // ---- Footer ----
  doc.setDrawColor(...LIGHT).setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...BLUE);
  doc.text('Thank you for your business!', pageW / 2, y, { align: 'center' });
  y += 3.5;

  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...GREY);
  doc.text('Evopay Car Wash  |  KRA eTIMS VSCU v2.0.21', pageW / 2, y, { align: 'center' });

  return doc;
};