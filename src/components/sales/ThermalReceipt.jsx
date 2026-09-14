import React, { useRef, useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { toast } from 'react-toastify';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { printReceipt, getCachedConfig, fetchPrinterConfig } from '../../utils/printer';

// Bridge to native printer (defined in MainActivity.java) — UNCHANGED, do not touch.
const NativePrinter = registerPlugin('TelpoPrinter');
const isNative = Capacitor.isNativePlatform();

// ---------- Helpers ----------
const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
};

const getPaymentLabel = (saleData) => {
  const fields = ['payment_method', 'pmtTyCd', 'paymentType', 'payment', 'paymentMethod', 'pmtType'];
  let method = null;
  for (const f of fields) {
    if (saleData[f] !== undefined && saleData[f] !== null && saleData[f] !== '') {
      method = String(saleData[f]).trim();
      break;
    }
  }
  if (method === '01' || method === '1') return 'Cash';
  if (method === '02' || method === '2') return 'Card';
  if (method === '03' || method === '3') return 'M-Pesa';
  const upper = (method || '').toUpperCase();
  if (upper === 'CASH') return 'Cash';
  if (upper === 'CARD') return 'Card';
  if (upper.includes('MPESA') || upper.includes('MOBILE')) return 'M-Pesa';
  return method || 'N/A';
};

const isSigned = (saleData) => saleData?.synced === 1 && !!saleData?.vscu_signature;

// Build the payload KRA expects
const buildKraPayload = (saleData) => {
  const d = new Date(saleData.created_at || saleData.date || new Date().toISOString());
  const invoiceDate =
    String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    d.getFullYear();
  const invoiceTime =
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
  const cuId = saleData.cuId || 'KRACU0300003735';
  const cuReceiptNumber = saleData.invoice_no || '1';
  const internalData = saleData.internal_data || '';
  const signature = saleData.vscu_signature || '';
  return `${invoiceDate}#${invoiceTime}#${cuId}#${cuReceiptNumber}#${internalData}#${signature}`;
};

// Signed → KRA portal URL.  Unsigned → local /pay/<invoice> page.
const buildQrTarget = (saleData) => {
  if (isSigned(saleData)) {
    const payload = buildKraPayload(saleData);
    return `https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceipt?qrCode=${encodeURIComponent(payload)}`;
  }
  const base = import.meta.env.VITE_PAYMENT_BASE_URL || window.location.origin;
  const invoice = saleData.invoice_no || 'N/A';
  return `${base}/pay/${encodeURIComponent(invoice)}`;
};

const generateQRCodeDataURL = async (saleData) => {
  try {
    const target = buildQrTarget(saleData);
    return await QRCode.toDataURL(target, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
  } catch (e) {
    console.error('QR Code generation failed:', e);
    return null;
  }
};

const getQRString = (saleData) => {
  try {
    return buildQrTarget(saleData);
  } catch {
    return '';
  }
};

// Build a plain-text receipt for ESC/POS printers (native Android path)
// UNCHANGED — the native bridge depends on this exact formatting.
const buildPlainTextReceipt = (sale) => {
  const line = '-'.repeat(32);
  const eq = '='.repeat(32);
  const items = sale.items || [];
  const paymentLabel = getPaymentLabel(sale);
  const dateStr = formatDateTime(sale.created_at || sale.date || new Date().toISOString());
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';

  let txt = '';
  txt += '        EVOPAY CAR WASH\n';
  txt += '      eTIMS Compliant Receipt\n';
  if (kraPin) txt += `         PIN: ${kraPin}\n`;
  txt += `Invoice: ${sale.invoice_no || 'N/A'}\n`;
  txt += `${eq}\n`;
  txt += `Cashier: ${sale.user_name || sale.cashier || 'Unknown'}\n`;
  txt += `Customer: ${sale.customer || 'Walk-in'}\n`;
  txt += `Date: ${dateStr}\n`;
  txt += `Payment: ${paymentLabel}\n`;
  if (sale.customer_pin && sale.customer_pin !== 'N/A' && sale.customer_pin !== '') {
    txt += `PIN: ${sale.customer_pin}\n`;
  }
  txt += `${line}\n`;
  txt += 'ITEM                  QTY  PRICE  TOTAL\n';
  txt += `${line}\n`;

  items.forEach((item) => {
    const qty = item.quantity || 0;
    const price = item.price || 0;
    const amount = qty * price;
    let name = item.item_name || item.name || 'Unknown';
    if (name.length > 18) name = name.substring(0, 18);
    txt += name.padEnd(20) + String(qty).padStart(3) + ' ' +
           price.toFixed(0).padStart(6) + ' ' + amount.toFixed(0).padStart(6) + '\n';
  });

  txt += `${line}\n`;
  txt += `Subtotal:`.padEnd(24) + `KES ${(sale.subtotal || 0).toFixed(2)}\n`;
  txt += `VAT (16%):`.padEnd(24) + `KES ${(sale.tax || 0).toFixed(2)}\n`;
  txt += `TOTAL:`.padEnd(24) + `KES ${(sale.total || 0).toFixed(2)}\n`;
  txt += `${eq}\n`;
  txt += isSigned(sale)
    ? '      KRA eTIMS Verified\n'
    : '      Pending eTIMS sync\n';
  txt += `SCU: ${sale.scuId || 'EVO-VSCU-001'}\n`;
  txt += `CU:  ${sale.cuId || `CU-${String(Date.now()).slice(-6)}`}\n`;
  txt += `${line}\n`;
  txt += '   Thank you for your business!\n';
  txt += '     KRA eTIMS VSCU v2.0.21\n';
  txt += '\n\n\n\n';
  return txt;
};

// ---------- Dynamic paper-width detection ----------
// Reads whatever shape utils/printer's config gives us and normalizes to 58 or 80mm.
// Defaults to 80mm (the common thermal size) if nothing is configured.
const getPaperWidthMM = (cfg) => {
  const raw = cfg?.paperWidth ?? cfg?.paper_width ?? cfg?.width ?? cfg?.paperSize ?? 80;
  const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  return n === 58 ? 58 : 80;
};

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// ---------- PDF generation (used for "Download PDF") ----------
// Columns are now computed as fractions of the actual page width instead of
// hardcoded millimeters, so nothing overlaps on 58mm paper or with long
// item names / large prices, and the font scales sensibly per paper size.
export const generateThermalReceipt = async (saleData, logoRef = null, paperWidthMM = 80) => {
  try {
    const items = saleData.items || [];
    let calcSubtotal = 0;
    let calcTax = 0;
    items.forEach((item) => {
      const amount = (item.quantity || 0) * (item.price || 0);
      calcSubtotal += amount;
      const taxType = item.tax_type || item.taxTyCd || 'B';
      calcTax += taxType === 'B' ? (amount * 16 / 116) : 0;
    });
    const subtotal = saleData.subtotal || calcSubtotal || 0;
    const tax = saleData.tax || calcTax || 0;
    const total = saleData.total || subtotal || 0;

    const signed = isSigned(saleData);
    let qrCodeDataURL = null;
    try { qrCodeDataURL = await generateQRCodeDataURL(saleData); } catch {}

    const isNarrow = paperWidthMM <= 58;
    const margin = isNarrow ? 3 : 4;
    const baseFont = isNarrow ? 8.5 : 9.5;
    const totalFont = isNarrow ? 11 : 12.5;
    const qrSize = isNarrow ? 22 : 26;

    // Usable width available for the item table (after margins)
    const usableWidth = paperWidthMM - margin * 2;
    // Name column gets ~54% of usable width, leaving room for qty/price/total
    const nameColWidth = usableWidth * 0.5;

    // Measure pass to size the document
    const tempDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [paperWidthMM, 200] });
    tempDoc.setFont('courier', 'normal');
    tempDoc.setFontSize(baseFont);

    let itemsHeight = 0;
    items.forEach((item) => {
      const splitName = tempDoc.splitTextToSize(item.item_name || item.name || 'Unknown', nameColWidth);
      itemsHeight += splitName.length * (baseFont * 0.5) + 3;
    });

    const qrHeight = qrCodeDataURL ? qrSize + 8 : 12;
    const totalHeight = 160 + qrHeight + (items.length ? itemsHeight : 12);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [paperWidthMM, totalHeight],
      compress: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const leftCol = margin;
    const rightCol = pageWidth - margin;
    const blue = [26, 42, 74];
    const black = [0, 0, 0];
    let y = margin + 3;

    // Column x-positions, computed from actual usable width so they always fit
    const xItem = leftCol;
    const xQty = leftCol + usableWidth * 0.56;
    const xPrice = leftCol + usableWidth * 0.74;
    const xTotal = rightCol;

    // ---- Logo ----
    if (logoRef?.current?.complete && logoRef.current.naturalWidth !== 0) {
      const el = logoRef.current;
      const logoHeight = isNarrow ? 12 : 15;
      const logoWidth = (el.naturalWidth / el.naturalHeight) * logoHeight;
      doc.addImage(el, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
      y += logoHeight + 4;
    } else {
      y += 4;
    }

    // ---- Brand ----
    doc.setFont('courier', 'bold').setFontSize(isNarrow ? 10 : 11).setTextColor(...blue);
    doc.text('EVOPAY CAR WASH', pageWidth / 2, y, { align: 'center' });
    y += 5;

    doc.setFont('courier', 'bold').setFontSize(baseFont).setTextColor(...blue);
    doc.text('eTIMS Compliant Receipt', pageWidth / 2, y, { align: 'center' });
    y += 5;

    // ---- KRA PIN ----
    const kraPin = import.meta.env.VITE_VSCU_TIN || '';
    if (kraPin) {
      doc.setFont('courier', 'normal').setFontSize(baseFont).setTextColor(...black);
      doc.text(`PIN: ${kraPin}`, pageWidth / 2, y, { align: 'center' });
      y += 5;
    }

    // ---- Invoice (big) ----
    doc.setFont('courier', 'bold').setFontSize(isNarrow ? 10 : 11).setTextColor(...black);
    doc.text(`Invoice: ${saleData.invoice_no || 'N/A'}`, pageWidth / 2, y, { align: 'center' });
    y += 6;

    doc.setDrawColor(...blue).setLineWidth(0.3).line(margin, y, pageWidth - margin, y);
    y += 5;

    // ---- Meta block ----
    doc.setFont('courier', 'normal').setFontSize(baseFont).setTextColor(...black);
    const paymentLabel = getPaymentLabel(saleData);
    const dateStr = formatDateTime(saleData.created_at || saleData.date || new Date().toISOString());

    doc.text(`Cashier: ${saleData.user_name || saleData.cashier || 'Unknown'}`, leftCol, y);
    y += 5;
    doc.text(`Customer: ${saleData.customer || 'Walk-in'}`, leftCol, y);
    y += 5;
    doc.text(`Date: ${dateStr}`, leftCol, y);
    y += 5;
    doc.text(`Payment: ${paymentLabel}`, leftCol, y);
    y += 5;
    if (saleData.customer_pin && saleData.customer_pin !== 'N/A' && saleData.customer_pin !== '') {
      doc.text(`PIN: ${saleData.customer_pin}`, leftCol, y);
      y += 5;
    }

    y += 1;
    doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
    y += 5;

    // ---- Items ----
    if (items.length) {
      doc.setFont('courier', 'bold').setFontSize(baseFont).setTextColor(...blue);
      doc.text('ITEM', xItem, y);
      doc.text('QTY', xQty, y, { align: 'center' });
      doc.text('PRICE', xPrice, y, { align: 'center' });
      doc.text('TOTAL', xTotal, y, { align: 'right' });
      y += 4;
      doc.setDrawColor(...blue).setLineWidth(0.2).line(margin, y, pageWidth - margin, y);
      y += 4;

      doc.setFont('courier', 'normal').setFontSize(baseFont).setTextColor(...black);
      items.forEach((item) => {
        const qty = item.quantity || 0;
        const price = item.price || 0;
        const amount = qty * price;
        const name = item.item_name || item.name || 'Unknown';
        const lines = doc.splitTextToSize(name, nameColWidth);
        doc.text(lines, xItem, y);
        // If the name wrapped to multiple lines, print the numbers next to the first line
        doc.text(`${qty}`, xQty, y, { align: 'center' });
        doc.text(`${price.toFixed(2)}`, xPrice, y, { align: 'center' });
        doc.text(`${amount.toFixed(2)}`, xTotal, y, { align: 'right' });
        y += lines.length * (baseFont * 0.5) + 3;
      });

      y += 2;
      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 5;

      // ---- Totals ----
      doc.setFont('courier', 'normal').setFontSize(baseFont).setTextColor(...blue);
      doc.text('Subtotal:', leftCol, y);
      doc.text(`KES ${subtotal.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 5;
      doc.text('VAT (16%):', leftCol, y);
      doc.text(`KES ${tax.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 6;

      doc.setFont('courier', 'bold').setFontSize(totalFont);
      doc.text('TOTAL:', leftCol, y);
      doc.text(`KES ${total.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 7;

      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 5;

      // ---- Verification ----
      doc.setFont('courier', 'bold').setFontSize(baseFont);
      if (signed) {
        doc.setTextColor(0, 130, 0);
        doc.text('KRA eTIMS Verified', pageWidth / 2, y, { align: 'center' });
      } else {
        doc.setTextColor(180, 120, 0);
        doc.text('Pending eTIMS sync', pageWidth / 2, y, { align: 'center' });
      }
      y += 5;

      doc.setFont('courier', 'normal').setFontSize(baseFont - 1).setTextColor(...black);
      doc.text(`SCU: ${saleData.scuId || 'EVO-VSCU-001'}`, leftCol, y);
      y += 4;
      doc.text(`CU: ${saleData.cuId || `CU-${String(Date.now()).slice(-6)}`}`, leftCol, y);
      y += 5;

      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 5;

      // ---- QR ----
      if (qrCodeDataURL) {
        try {
          doc.addImage(qrCodeDataURL, 'PNG', (pageWidth - qrSize) / 2, y, qrSize, qrSize);
          y += qrSize + 2;
          doc.setFont('courier', 'normal').setFontSize(6).setTextColor(100, 100, 100);
          doc.text(
            signed ? 'Scan to verify with KRA' : 'Scan to view receipt',
            pageWidth / 2,
            y,
            { align: 'center' }
          );
          y += 5;
        } catch {}
      }

      y += 1;
      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 5;

      // ---- Footer ----
      doc.setFont('courier', 'bold').setFontSize(baseFont).setTextColor(...blue);
      doc.text('Thank you for your business!', pageWidth / 2, y, { align: 'center' });
      y += 5;
      doc.setFont('courier', 'normal').setFontSize(7).setTextColor(100, 100, 100);
      doc.text('KRA eTIMS VSCU v2.0.21', pageWidth / 2, y, { align: 'center' });
    } else {
      doc.setFont('courier', 'normal').setFontSize(baseFont).setTextColor(...black);
      doc.text('No items found', margin, y + 5);
    }

    return doc;
  } catch (e) {
    console.error('Error generating thermal receipt:', e);
    return null;
  }
};

// ---------- HTML-based receipt for real browser printing ----------
// This is what actually goes to non-Android web printers (e.g. printing
// from the browser to an ATP S900 or any other printer via the OS print
// dialog / driver). Using real CSS layout instead of fixed PDF coordinates
// means: the browser wraps long item names itself, numeric columns never
// collide with the name column, and the font is sized in real px/mm tied
// to the actual paper width — so it prints crisp, never "shrunk" the way a
// rescaled PDF blob sometimes does.
const buildReceiptHTML = (sale, qrCodeDataURL, paperWidthMM = 80) => {
  const items = sale.items || [];
  const paymentLabel = getPaymentLabel(sale);
  const dateStr = formatDateTime(sale.created_at || sale.date || new Date().toISOString());
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';
  const signed = isSigned(sale);
  const subtotal = sale.subtotal || 0;
  const tax = sale.tax || 0;
  const total = sale.total || subtotal || 0;
  const isNarrow = paperWidthMM <= 58;

  const baseFontPx = isNarrow ? 11 : 13;
  const titleFontPx = isNarrow ? 13 : 15;
  const totalFontPx = isNarrow ? 15 : 17;
  const gridCols = isNarrow ? '6mm 11mm 12mm' : '8mm 14mm 16mm';
  const qrSize = isNarrow ? '20mm' : '24mm';

  const itemsRows = items.map((item) => {
    const qty = item.quantity || 0;
    const price = item.price || 0;
    const amount = qty * price;
    const name = escapeHtml(item.item_name || item.name || 'Unknown');
    return `
      <div class="row item-row">
        <div class="col-name">${name}</div>
        <div class="col-qty">${qty}</div>
        <div class="col-price">${price.toFixed(2)}</div>
        <div class="col-total">${amount.toFixed(2)}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt</title>
<style>
  @page { size: ${paperWidthMM}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${paperWidthMM}mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${baseFontPx}px;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt { padding: 2mm 3mm 6mm; width: 100%; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .brand { font-size: ${titleFontPx}px; font-weight: 700; color: #1a2a4a; }
  .sub { font-size: ${baseFontPx}px; font-weight: 700; color: #1a2a4a; }
  .divider { border-top: 1px dashed #1a2a4a; margin: 2mm 0; }
  .divider-solid { border-top: 1px solid #1a2a4a; margin: 2mm 0; }
  .meta-row { display: flex; justify-content: space-between; gap: 2mm; margin: 1mm 0; word-break: break-word; }
  .row { display: grid; grid-template-columns: 1fr ${gridCols}; gap: 1mm; align-items: start; }
  .header-row { font-weight: 700; color: #1a2a4a; margin-bottom: 1mm; }
  .item-row { margin-bottom: 1.5mm; word-break: break-word; }
  .col-qty, .col-price, .col-total { text-align: right; white-space: nowrap; }
  .totals-row { display: flex; justify-content: space-between; margin: 1mm 0; }
  .grand-total { font-size: ${totalFontPx}px; font-weight: 700; color: #1a2a4a; }
  .status-signed { color: #067a06; font-weight: 700; text-align: center; }
  .status-pending { color: #b47800; font-weight: 700; text-align: center; }
  .qr-wrap { text-align: center; margin: 2mm 0; }
  .qr-wrap img { width: ${qrSize}; height: ${qrSize}; }
  .footnote { text-align: center; font-size: ${baseFontPx - 3}px; color: #555; }
</style>
</head>
<body>
  <div class="receipt">
    <div class="center brand">EVOPAY CAR WASH</div>
    <div class="center sub">eTIMS Compliant Receipt</div>
    ${kraPin ? `<div class="center">PIN: ${escapeHtml(kraPin)}</div>` : ''}
    <div class="center bold" style="font-size:${titleFontPx}px;margin-top:1mm;">Invoice: ${escapeHtml(sale.invoice_no || 'N/A')}</div>
    <div class="divider-solid"></div>

    <div class="meta-row"><span>Cashier: ${escapeHtml(sale.user_name || sale.cashier || 'Unknown')}</span><span>Customer: ${escapeHtml(sale.customer || 'Walk-in')}</span></div>
    <div class="meta-row"><span>Date: ${escapeHtml(dateStr)}</span><span>Type: Normal Sale</span></div>
    <div class="meta-row"><span>Payment: ${escapeHtml(paymentLabel)}</span><span></span></div>
    ${sale.customer_pin && sale.customer_pin !== 'N/A' && sale.customer_pin !== '' ? `<div class="meta-row"><span>PIN: ${escapeHtml(sale.customer_pin)}</span><span></span></div>` : ''}

    <div class="divider-solid"></div>

    <div class="row header-row">
      <div>ITEM</div><div class="col-qty">QTY</div><div class="col-price">PRICE</div><div class="col-total">TOTAL</div>
    </div>
    <div class="divider"></div>
    ${itemsRows || '<div class="center">No items found</div>'}
    <div class="divider-solid"></div>

    <div class="totals-row"><span>Subtotal:</span><span>KES ${subtotal.toFixed(2)}</span></div>
    <div class="totals-row"><span>VAT (16%):</span><span>KES ${tax.toFixed(2)}</span></div>
    <div class="totals-row grand-total"><span>TOTAL:</span><span>KES ${total.toFixed(2)}</span></div>

    <div class="divider-solid"></div>
    <div class="${signed ? 'status-signed' : 'status-pending'}">${signed ? 'KRA eTIMS Verified' : 'Pending eTIMS sync'}</div>

    <div class="meta-row" style="margin-top:1mm;"><span>SCU: ${escapeHtml(sale.scuId || 'EVO-VSCU-001')}</span><span>CU: ${escapeHtml(sale.cuId || `CU-${String(Date.now()).slice(-6)}`)}</span></div>
    <div class="divider-solid"></div>

    ${qrCodeDataURL ? `
      <div class="qr-wrap">
        <img src="${qrCodeDataURL}" alt="Receipt QR" />
        <div class="footnote">${signed ? 'Scan to verify with KRA' : 'Scan to view receipt'}</div>
      </div>
      <div class="divider"></div>
    ` : ''}

    <div class="center bold" style="color:#1a2a4a;">Thank you for your business!</div>
    <div class="footnote">KRA eTIMS VSCU v2.0.21</div>
  </div>
</body>
</html>`;
};

// Prints the given HTML via a hidden iframe using the browser's own print
// dialog/driver — this is what actually talks to the OS-level printer
// (USB/network thermal printer, ATP S900, etc.) for the non-Android web path.
const printHTMLReceipt = (html) =>
  new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');

    let settled = false;
    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };

    iframe.onload = () => {
      // Give images (QR code, logo) a beat to paint before invoking print
      setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          win.focus();
          win.print();
          if (!settled) { settled = true; resolve(); }
        } catch (err) {
          if (!settled) { settled = true; reject(err); }
        } finally {
          cleanup();
        }
      }, 250);
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });

// ---------- Component ----------
const ThermalReceipt = ({ sale, onClose, onDownload, onPrint }) => {
  const logoRef = useRef(null);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printerCfg, setPrinterCfg] = useState(getCachedConfig());

  const signed = isSigned(sale);

  useEffect(() => {
    if (sale) {
      generateQRCodeDataURL(sale).then(setQrCodeData);
    }
  }, [sale]);

  useEffect(() => {
    let cancelled = false;
    fetchPrinterConfig().then((cfg) => {
      if (!cancelled) setPrinterCfg(cfg);
    });
    return () => { cancelled = true; };
  }, []);

  const paymentLabel = getPaymentLabel(sale);
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';

  // ---------- Native print (Android APK) — UNCHANGED ----------
  const handleNativePrint = async () => {
    setPrinting(true);
    try {
      const text = buildPlainTextReceipt(sale);
      await NativePrinter.printText({ text });
      toast.success('Receipt printed');
      if (onPrint) onPrint();
    } catch (err) {
      console.error('Print failed:', err);
      toast.error('Print failed: ' + (err.message || 'Unknown error'));
    } finally {
      setPrinting(false);
    }
  };

  // ---------- Web print (non-Android) ----------
  // Tries the configured native/network printer bridge first (unchanged),
  // then falls back to a real HTML print via the browser — dynamic per
  // paper width, no fixed coordinates, so nothing overlaps or prints tiny.
  const handleWebPrint = async () => {
    setPrinting(true);
    try {
      if (printerCfg.mode !== 'browser') {
        try {
          await printReceipt(sale, printerCfg);
          toast.success('Receipt sent to printer');
          if (onPrint) onPrint();
          return;
        } catch (nativeErr) {
          console.warn('Configured printer failed, falling back to browser print:', nativeErr);
          toast.info('Printer unavailable — using browser print');
        }
      }

      const paperWidthMM = getPaperWidthMM(printerCfg);
      const qr = qrCodeData || (await generateQRCodeDataURL(sale));
      const html = buildReceiptHTML(sale, qr, paperWidthMM);
      await printHTMLReceipt(html);
      if (onPrint) onPrint();
    } catch (e) {
      console.error(e);
      toast.error('Print failed: ' + (e.message || 'Unknown'));
    } finally {
      setPrinting(false);
    }
  };

  // ---------- Download PDF (web only) ----------
  const handleDownload = async () => {
    try {
      const paperWidthMM = getPaperWidthMM(printerCfg);
      const doc = await generateThermalReceipt(sale, logoRef, paperWidthMM);
      if (!doc) return toast.error('Failed to generate receipt');
      doc.save(`receipt-${sale.invoice_no || Date.now()}.pdf`);
      if (onDownload) onDownload();
      toast.success('Downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Download failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[95vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-bold text-[#1a2a4a]">Receipt</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
          <div className="max-w-[80mm] mx-auto bg-white shadow-lg">
            <div className="p-4 font-mono text-[11px]">
              <div className="flex justify-center mb-2">
                <img
                  ref={logoRef}
                  src="/evopay-logo.png"
                  alt="Evopay Logo"
                  className="h-14 object-contain"
                  onError={(e) => (e.target.style.display = 'none')}
                />
              </div>

              <div className="text-center font-bold text-[#1a2a4a] text-sm">
                EVOPAY CAR WASH
              </div>
              <div className="text-center font-bold text-[#1a2a4a] text-xs mt-1">
                eTIMS Compliant Receipt
              </div>
              {kraPin && (
                <div className="text-center text-[10px] text-gray-700 mt-1">
                  PIN: {kraPin}
                </div>
              )}
              <div className="text-center font-bold text-[#1a2a4a] text-base mt-2">
                Invoice: {sale.invoice_no || 'N/A'}
              </div>
              <hr className="border-[#1a2a4a] my-2" />

              <div className="text-[10px] leading-relaxed">
                <div className="flex justify-between">
                  <span>Cashier: {sale.user_name || sale.cashier || 'Unknown'}</span>
                  <span>Customer: {sale.customer || 'Walk-in'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date: {formatDateTime(sale.created_at || sale.date || new Date().toISOString())}</span>
                  <span>Type: Normal Sale</span>
                </div>
                <div>Payment: {paymentLabel}</div>
                {sale.customer_pin && sale.customer_pin !== 'N/A' && (
                  <div>PIN: {sale.customer_pin}</div>
                )}
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              <div className="flex font-bold text-[#1a2a4a] text-[10px]">
                <div className="flex-1">ITEM</div>
                <div className="w-8 text-center">QTY</div>
                <div className="w-14 text-center">PRICE</div>
                <div className="w-16 text-center">TOTAL</div>
              </div>
              <hr className="border-[#1a2a4a] my-1" />

              <div className="text-[10px] leading-relaxed">
                {(sale.items || []).map((item, idx) => {
                  const qty = item.quantity || 0;
                  const price = item.price || 0;
                  const amount = qty * price;
                  const name = item.item_name || item.name || 'Unknown';
                  return (
                    <div key={idx} className="mb-1">
                      <div className="whitespace-normal break-words">{name}</div>
                      <div className="flex">
                        <div className="flex-1"></div>
                        <div className="w-8 text-center">{qty}</div>
                        <div className="w-14 text-center">{price.toFixed(2)}</div>
                        <div className="w-16 text-center">{amount.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              <div className="text-[11px] leading-relaxed">
                <div className="flex justify-between">
                  <span className="text-[#1a2a4a]">Subtotal:</span>
                  <span className="text-[#1a2a4a]">KES {(sale.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1a2a4a]">VAT (16%):</span>
                  <span className="text-[#1a2a4a]">KES {(sale.tax || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#1a2a4a] text-base mt-1">
                  <span>TOTAL:</span>
                  <span>KES {(sale.total || 0).toFixed(2)}</span>
                </div>
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              <div className="text-center text-[10px] font-bold">
                {signed
                  ? <div className="text-green-700">KRA eTIMS Verified</div>
                  : <div className="text-amber-600">Pending eTIMS sync</div>}
              </div>

              <div className="flex justify-between text-[9px] mt-1">
                <span>SCU: {sale.scuId || 'EVO-VSCU-001'}</span>
                <span>CU: {sale.cuId || `CU-${String(Date.now()).slice(-6)}`}</span>
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              {qrCodeData && (
                <div className="text-center my-2">
                  <img src={qrCodeData} alt="Receipt QR" className="mx-auto" style={{ width: '100px', height: '100px' }} />
                  <div className="text-[8px] text-gray-600 mt-1">
                    {signed ? 'Scan to verify with KRA' : 'Scan to view receipt'}
                  </div>
                </div>
              )}

              <div className="text-center text-[#1a2a4a] text-[11px] font-bold">
                Thank you for your business!
              </div>
              <div className="text-center text-gray-500 text-[8px]">
                KRA eTIMS VSCU v2.0.21
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 sm:p-4 border-t border-gray-200 flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={isNative ? handleNativePrint : handleWebPrint}
            disabled={printing}
            className="w-full sm:w-auto px-4 py-2.5 bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {printing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
                Printing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {isNative ? 'Print Receipt' : 'Print'}
              </>
            )}
          </button>

          {!isNative && (
            <button
              onClick={handleDownload}
              className="w-full sm:w-auto px-4 py-2.5 bg-[#1a2a4a] hover:bg-[#2a3a5a] text-white rounded-lg font-semibold text-sm"
            >
              Download PDF
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg font-semibold text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThermalReceipt;