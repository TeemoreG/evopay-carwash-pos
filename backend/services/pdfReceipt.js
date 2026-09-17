const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const https = require('https');
const http = require('http');

const BLUE = '#1a2a4a';
const ORANGE = '#f47b20';
const GREY = '#6e6e6e';
const LIGHT = '#dcdce0';
const ROW_ALT = '#f6f9fc';
const GREEN = '#057a05';
const AMBER = '#b47800';
const BLACK = '#000000';
const WHITE = '#ffffff';

const paymentLabel = (sale) => {
  const m = String(sale.payment_method || '').trim();
  if (m === '01' || m === '1') return 'Cash';
  if (m === '02' || m === '2') return 'Card';
  if (m === '03' || m === '3') return 'M-Pesa';
  return m || 'N/A';
};

const isSigned = (sale) => sale?.synced === 1 && !!sale?.vscu_signature;

const buildQrTarget = (sale, baseUrl) => {
  if (isSigned(sale)) {
    const d = new Date(sale.created_at || sale.date || new Date().toISOString());
    const date = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
    const time = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    const cuId = sale.cuId || 'KRACU0300003735';
    const payload = `${date}#${time}#${cuId}#${sale.invoice_no || ''}#${sale.internal_data || ''}#${sale.vscu_signature || ''}`;
    return `https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceipt?qrCode=${encodeURIComponent(payload)}`;
  }
  return `${baseUrl}/receipt/${sale.invoice_no}`;
};

// Fetch an image URL as Buffer — works for the logo served by our own frontend
const fetchImageBuffer = (url) => new Promise((resolve) => {
  if (!url) return resolve(null);
  const lib = url.startsWith('https') ? https : http;
  lib.get(url, (res) => {
    if (res.statusCode !== 200) return resolve(null);
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', () => resolve(null));
  }).on('error', () => resolve(null));
});

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

/**
 * Streams a PDF to the response.
 * sale = full sale object with items
 * publicBase = https://evopay-carwash-pos.onrender.com
 */
async function streamReceiptPdf(sale, publicBase, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: `Receipt ${sale.invoice_no}`,
      Author: 'Evopay Car Wash',
      Subject: 'Receipt',
    },
  });

  // Stream directly to the HTTP response
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 50;
  const contentW = pageW - margin * 2;
  const rightX = pageW - margin;

  const signed = isSigned(sale);
  const kraPin = process.env.TIN || '';
  const items = sale.items || [];
  const subtotal = Number(sale.subtotal || 0);
  const tax = Number(sale.tax || 0);
  const total = Number(sale.total || 0);

  let y = margin;

  // ---- Logo (fetch + place) ----
  try {
    const logoUrl = `${publicBase}/evopay-logo.jpg`;
    const buf = await fetchImageBuffer(logoUrl);
    if (buf) {
      const logoH = 55;
      const logoW = logoH * 3; // assume 3:1
      doc.image(buf, (pageW - logoW) / 2, y, { width: logoW, height: logoH });
      y += logoH + 15;
    }
  } catch (e) {
    console.warn('[PDF] logo failed:', e.message);
  }

  // ---- Business name ----
  doc.font('Helvetica-Bold').fontSize(26).fillColor(BLUE)
     .text('EVOPAY CAR WASH', margin, y, { width: contentW, align: 'center' });
  y += 32;

  doc.font('Helvetica').fontSize(11).fillColor(GREY)
     .text('eTIMS Compliant Receipt', margin, y, { width: contentW, align: 'center' });
  y += 16;

  if (kraPin) {
    doc.fontSize(10).fillColor(GREY)
       .text(`KRA PIN: ${kraPin}`, margin, y, { width: contentW, align: 'center' });
    y += 16;
  }

  // Divider
  doc.strokeColor(BLUE).lineWidth(1).moveTo(margin, y).lineTo(rightX, y).stroke();
  y += 22;

  // ---- "RECEIPT" title ----
  doc.font('Helvetica-Bold').fontSize(18).fillColor(ORANGE)
     .text('RECEIPT', margin, y);
  y += 28;

  // ---- Meta block (two columns) ----
  const leftColX = margin;
  const leftValX = margin + 90;
  const rightColX = pageW / 2 + 20;
  const rightValX = rightColX + 90;

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

  const metaStartY = y;
  metaLeft.forEach(([k, v], i) => {
    const yy = metaStartY + i * 20;
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text(k, leftColX, yy);
    doc.font('Helvetica-Bold').fillColor(BLACK).text(String(v), leftValX, yy);
  });
  metaRight.forEach(([k, v], i) => {
    const yy = metaStartY + i * 20;
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text(k, rightColX, yy);
    doc.font('Helvetica-Bold').fillColor(BLACK).text(String(v), rightValX, yy);
  });
  y = metaStartY + metaLeft.length * 20 + 15;

  // ---- Items table header ----
  const rowH = 26;
  doc.rect(margin, y, contentW, rowH).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE);

  const colQtyX = margin + contentW - 140;
  const colPriceX = margin + contentW - 75;
  const colTotalX = rightX - 15;

  doc.text('ITEM', margin + 12, y + 8);
  doc.text('QTY', colQtyX, y + 8, { width: 50, align: 'right' });
  doc.text('PRICE', colPriceX, y + 8, { width: 60, align: 'right' });
  doc.text('TOTAL', colTotalX, y + 8, { width: 90, align: 'right' });
  y += rowH;

  // ---- Item rows ----
  items.forEach((it, idx) => {
    const name = it.item_name || it.name || 'Unknown';
    const qty = Number(it.quantity || 0);
    const price = Number(it.price || 0);
    const amount = Number(it.total || qty * price);

    const nameW = colQtyX - (margin + 12) - 10;
    const nameH = doc.heightOfString(name, { width: nameW });
    const thisRowH = Math.max(26, nameH + 12);

    if (idx % 2 === 0) {
      doc.rect(margin, y, contentW, thisRowH).fill(ROW_ALT);
    }

    doc.font('Helvetica').fontSize(10).fillColor(BLACK);
    doc.text(name, margin + 12, y + 8, { width: nameW });
    doc.text(String(qty), colQtyX, y + 8, { width: 50, align: 'right' });
    doc.text(price.toFixed(2), colPriceX, y + 8, { width: 60, align: 'right' });
    doc.text(amount.toFixed(2), colTotalX, y + 8, { width: 90, align: 'right' });
    y += thisRowH;
  });

  // Divider after items
  doc.strokeColor(BLUE).lineWidth(0.5).moveTo(margin, y).lineTo(rightX, y).stroke();
  y += 20;

  // ---- Totals ----
  const totLabelX = pageW - margin - 200;
  const totValX = rightX - 15;

  doc.font('Helvetica').fontSize(11).fillColor(GREY);
  doc.text('Subtotal', totLabelX, y);
  doc.fillColor(BLACK).text(`KES ${subtotal.toFixed(2)}`, totValX, y, { width: 150, align: 'right' });
  y += 18;

  doc.fillColor(GREY).text('VAT (16%)', totLabelX, y);
  doc.fillColor(BLACK).text(`KES ${tax.toFixed(2)}`, totValX, y, { width: 150, align: 'right' });
  y += 24;

  // Grand total band
  doc.rect(totLabelX - 10, y - 6, rightX - totLabelX + 10, 32).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(WHITE);
  doc.text('TOTAL', totLabelX, y + 5);
  doc.text(`KES ${total.toFixed(2)}`, totValX, y + 5, { width: 150, align: 'right' });
  y += 50;

  // ---- QR ----
  try {
    const target = buildQrTarget(sale, publicBase);
    const qrDataUrl = await QRCode.toDataURL(target, { width: 400, margin: 1 });
    const qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrSize = 120;
    const qrX = (pageW - qrSize) / 2;
    doc.image(qrBuf, qrX, y, { width: qrSize, height: qrSize });
    y += qrSize + 8;

    doc.font('Helvetica').fontSize(9).fillColor(GREY)
       .text(signed ? 'Scan to verify on KRA' : 'Scan to view receipt online',
             margin, y, { width: contentW, align: 'center' });
    y += 18;
  } catch (e) {
    console.warn('[PDF] qr failed:', e.message);
  }

  // ---- Status ----
  if (signed) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GREEN)
       .text('KRA eTIMS VERIFIED', margin, y, { width: contentW, align: 'center' });
  } else {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(AMBER)
       .text('NON-FISCAL RECEIPT — PENDING eTIMS SYNC', margin, y, { width: contentW, align: 'center' });
    y += 16;
    doc.font('Helvetica').fontSize(9).fillColor(GREY)
       .text('Not a KRA tax invoice until verified.', margin, y, { width: contentW, align: 'center' });
  }
  y += 24;

  // ---- Footer ----
  doc.strokeColor(LIGHT).lineWidth(0.5).moveTo(margin, pageH - 70).lineTo(rightX, pageH - 70).stroke();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE)
     .text('Thank you for your business!', margin, pageH - 55, { width: contentW, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(GREY)
     .text('Evopay Car Wash  |  KRA eTIMS VSCU v2.0.21', margin, pageH - 38, { width: contentW, align: 'center' });

  doc.end();
}

module.exports = { streamReceiptPdf };