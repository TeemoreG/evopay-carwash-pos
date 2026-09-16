// src/utils/softCopyReceipt.js
// A4 soft-copy receipt generator.
// Distinct from the ESC/POS thermal format — this is what customers keep as a PDF.
// Same code path on mobile and desktop → same output everywhere.

import jsPDF from 'jspdf';
import QRCode from 'qrcode';

const BLUE = [26, 42, 74];
const ORANGE = [244, 123, 32];
const GREY = [120, 120, 120];
const LIGHT = [220, 224, 230];
const ROW_ALT = [248, 250, 252];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

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

const fmtDate = (s) => {
  if (!s) return 'N/A';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const generateSoftCopyReceipt = async (sale) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210;
  const pageH = 297;
  const margin = 18;
  const contentW = pageW - margin * 2;
  const rightX = pageW - margin;

  const logo = await loadLogo();
  const signed = isSigned(sale);
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';
  const items = sale.items || [];
  const subtotal = Number(sale.subtotal || 0);
  const tax = Number(sale.tax || 0);
  const total = Number(sale.total || 0);

  let y = margin;

  // Top accent bar
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 4, 'F');

  y = margin + 8;

  // Logo (centered)
  if (logo) {
    const lh = 22;
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    try {
      doc.addImage(logo, 'PNG', (pageW - lw) / 2, y, lw, lh);
      y += lh + 5;
    } catch {}
  }

  // Business name
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...BLUE);
  doc.text('EVOPAY CAR WASH', pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GREY);
  doc.text('eTIMS Compliant Receipt', pageW / 2, y, { align: 'center' });
  y += 5;

  if (kraPin) {
    doc.text(`KRA PIN: ${kraPin}`, pageW / 2, y, { align: 'center' });
    y += 5;
  }

  // Divider
  doc.setDrawColor(...BLUE).setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // "RECEIPT" title
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...ORANGE);
  doc.text('RECEIPT', margin, y);
  y += 9;

  // Meta block (two columns)
  const leftX = margin;
  const leftValX = margin + 24;
  const midX = pageW / 2 + 8;
  const midValX = midX + 24;

  const metaLeft = [
    ['Invoice', sale.invoice_no || 'N/A'],
    ['Cashier', sale.cashier || 'Unknown'],
    ['Customer', sale.customer || 'Walk-in'],
  ];
  const metaRight = [
    ['Date', fmtDate(sale.created_at || sale.date)],
    ['Time', fmtTime(sale.created_at || sale.date)],
    ['Payment', paymentLabel(sale)],
  ];

  const metaY = y;
  metaLeft.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GREY);
    doc.text(k, leftX, metaY + i * 6);
    doc.setFont('helvetica', 'bold').setTextColor(...BLACK);
    doc.text(v, leftValX, metaY + i * 6);
  });
  metaRight.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GREY);
    doc.text(k, midX, metaY + i * 6);
    doc.setFont('helvetica', 'bold').setTextColor(...BLACK);
    doc.text(v, midValX, metaY + i * 6);
  });
  y = metaY + metaLeft.length * 6 + 6;

  // Items table header
  doc.setFillColor(...BLUE);
  doc.rect(margin, y, contentW, 8, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...WHITE);

  const colQtyX = margin + contentW - 60;
  const colPriceX = margin + contentW - 32;
  const colTotalX = rightX - 3;

  doc.text('ITEM', margin + 3, y + 5.5);
  doc.text('QTY', colQtyX, y + 5.5, { align: 'right' });
  doc.text('PRICE', colPriceX, y + 5.5, { align: 'right' });
  doc.text('TOTAL', colTotalX, y + 5.5, { align: 'right' });
  y += 8;

  // Item rows
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...BLACK);
  items.forEach((it, idx) => {
    const name = it.item_name || it.name || 'Unknown';
    const qty = Number(it.quantity || 0);
    const price = Number(it.price || 0);
    const amount = Number(it.total || qty * price);

    const nameWidth = colQtyX - (margin + 3) - 4;
    const lines = doc.splitTextToSize(name, nameWidth);
    const rowH = Math.max(6.5, lines.length * 4.5 + 2);

    if (idx % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, contentW, rowH, 'F');
    }

    doc.setTextColor(...BLACK);
    doc.text(lines, margin + 3, y + 5);
    doc.text(String(qty), colQtyX, y + 5, { align: 'right' });
    doc.text(price.toFixed(2), colPriceX, y + 5, { align: 'right' });
    doc.text(amount.toFixed(2), colTotalX, y + 5, { align: 'right' });
    y += rowH;
  });

  doc.setDrawColor(...BLUE).setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Totals block
  const totLabelX = pageW - margin - 62;
  const totValX = rightX - 3;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GREY);
  doc.text('Subtotal', totLabelX, y);
  doc.setTextColor(...BLACK);
  doc.text(`KES ${subtotal.toFixed(2)}`, totValX, y, { align: 'right' });
  y += 6;

  doc.setTextColor(...GREY);
  doc.text('VAT (16%)', totLabelX, y);
  doc.setTextColor(...BLACK);
  doc.text(`KES ${tax.toFixed(2)}`, totValX, y, { align: 'right' });
  y += 8;

  // Grand total band
  doc.setFillColor(...BLUE);
  doc.rect(totLabelX - 4, y - 5, rightX - totLabelX + 4 + 3, 12, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...WHITE);
  doc.text('TOTAL', totLabelX, y + 3);
  doc.text(`KES ${total.toFixed(2)}`, totValX, y + 3, { align: 'right' });
  y += 20;

  // QR / verification
  try {
    const target = buildQrTarget(sale);
    const qrData = await QRCode.toDataURL(target, { width: 300, margin: 1, errorCorrectionLevel: 'M' });
    const qrSize = 38;
    const qrX = (pageW - qrSize) / 2;
    doc.addImage(qrData, 'PNG', qrX, y, qrSize, qrSize);
    y += qrSize + 3;

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY);
    doc.text(
      signed ? 'Scan to verify on KRA' : 'Scan to view receipt online',
      pageW / 2,
      y,
      { align: 'center' }
    );
    y += 7;
  } catch {}

  // Status badge
  doc.setFont('helvetica', 'bold').setFontSize(10);
  if (signed) {
    doc.setTextColor(0, 130, 0);
    doc.text('KRA eTIMS VERIFIED', pageW / 2, y, { align: 'center' });
  } else {
    doc.setTextColor(180, 120, 0);
    doc.text('PENDING eTIMS SYNC', pageW / 2, y, { align: 'center' });
  }

  // Footer
  doc.setDrawColor(...LIGHT).setLineWidth(0.3);
  doc.line(margin, pageH - 24, pageW - margin, pageH - 24);

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BLUE);
  doc.text('Thank you for your business!', pageW / 2, pageH - 15, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY);
  doc.text('Evopay Car Wash  |  KRA eTIMS VSCU v2.0.21', pageW / 2, pageH - 10, { align: 'center' });

  return doc;
};