const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const https = require('https');
const http = require('http');
const sizeOf = require('image-size');

const BLUE = '#000000';
const GREY = '#6e6e6e';
const MUTED = '#555555';
const LIGHT = '#CCCCCC';
const GREEN = '#057a05';
const AMBER = '#E35904';
const BLACK = '#000000';

const FONT = 'Times-Roman';
const FONT_BOLD = 'Times-Bold';

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
    const cuId = sale.sdc_id || sale.cuId || 'KRACU0300003735';
    const payload = `${date}#${time}#${cuId}#${sale.invoice_no || ''}#${sale.internal_data || ''}#${sale.vscu_signature || ''}`;
    return `https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceipt?qrCode=${encodeURIComponent(payload)}`;
  }
  return `${baseUrl}/receipt/${sale.invoice_no}`;
};

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

const TZ = 'Africa/Nairobi';

const fmtDate = (s) => {
  if (!s) return 'N/A';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString('en-KE', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-KE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
};

const mmToPt = (mm) => mm * 2.8346;

const solidLine = (doc, x1, x2, y, color = LIGHT, width = 0.4) => {
  doc.strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke();
};

// ---- Render pass. Returns final Y (height used). If measureOnly, skips images. ----
async function renderPass(sale, publicBase, doc, measureOnly) {
  const widthMM = 100;
  const marginMM = 8;

  const items = sale.items || [];
  const signed = isSigned(sale);
  const kraPin = process.env.TIN || '';
  const subtotal = Number(sale.subtotal || 0);
  const tax = Number(sale.tax || 0);
  const total = Number(sale.total || 0);

  const pageW = doc.page.width;
  const margin = mmToPt(marginMM);
  const contentW = pageW - margin * 2;
  const rightX = pageW - margin;

  let y = margin;

  // ---- Logo ----
  try {
    const logoUrl = `${publicBase}/evopay-logo.jpg`;
    const buf = await fetchImageBuffer(logoUrl);
    if (buf) {
      let logoW = contentW * 0.5;
      let logoH;
      try {
        const dims = sizeOf(buf);
        logoH = (dims.height / dims.width) * logoW;
      } catch (sizeErr) {
        logoH = logoW * 0.55;
      }
      if (!measureOnly) doc.image(buf, (pageW - logoW) / 2, y, { width: logoW, height: logoH });
      y += logoH - mmToPt(3);
    }
  } catch (e) {
    console.warn('[PDF] logo failed:', e.message);
  }

  doc.font(FONT_BOLD).fontSize(15).fillColor(BLUE)
     .text('CAR WASH', margin, y, { width: contentW, align: 'center' });
  y += 20;

  doc.font(FONT).fontSize(9).fillColor(GREY)
     .text('eTIMS Compliant Receipt', margin, y, { width: contentW, align: 'center' });
  y += 12;

  if (kraPin) {
    doc.font(FONT).fontSize(8).fillColor(GREY)
       .text(`KRA PIN: ${kraPin}`, margin, y, { width: contentW, align: 'center' });
    y += 12;
  }

  solidLine(doc, margin, rightX, y, BLUE, 0.7);
  y += 14;

  const metaRows = [
    ['Invoice', sale.invoice_no || 'N/A'],
    ['Cashier', sale.cashier || 'Unknown'],
    ['Customer', sale.customer || 'Walk-in'],
    ['Date', `${fmtDate(sale.created_at || sale.date)} ${fmtTime(sale.created_at || sale.date)}`],
    ['Payment', paymentLabel(sale)],
  ];
  metaRows.forEach(([k, v]) => {
    doc.font(FONT).fontSize(9).fillColor(MUTED)
       .text(k, margin, y, { width: contentW * 0.4, lineBreak: false });
    doc.font(FONT).fontSize(9).fillColor(MUTED)
       .text(String(v), margin, y, { width: contentW, align: 'right' });
    y += 12;
  });

  y += 4;

  const colQtyX = margin + contentW * 0.60;
  const colTotalX = rightX;

  doc.font(FONT_BOLD).fontSize(8).fillColor(BLUE);
  doc.text('ITEM', margin + 6, y + 4);
  doc.text('QTY', colQtyX, y + 4, { width: 30, align: 'right' });
  doc.text('TOTAL', colTotalX - 60, y + 4, { width: 60, align: 'right' });
  y += 12;
  solidLine(doc, margin, rightX, y, LIGHT, 0.5);
  y += 6;

  items.forEach((it) => {
    const name = it.item_name || it.name || 'Unknown';
    const qty = Number(it.quantity || 0);
    const price = Number(it.price || 0);
    const amount = Number(it.total || qty * price);

    const nameW = colQtyX - (margin + 6) - 6;
    const nameH = doc.font(FONT).fontSize(9).heightOfString(name, { width: nameW });
    const thisRowH = Math.max(14, nameH + 4);

    doc.font(FONT).fontSize(9).fillColor(BLACK);
    doc.text(name, margin + 6, y + 3, { width: nameW });
    doc.text(String(qty), colQtyX, y + 3, { width: 30, align: 'right' });
    doc.text(amount.toFixed(2), colTotalX - 60, y + 3, { width: 60, align: 'right' });
    y += thisRowH;
  });

  solidLine(doc, margin, rightX, y, BLUE, 0.5);
  y += 12;

  const totLabelX = margin;

  doc.font(FONT).fontSize(9).fillColor(GREY);
  doc.text('Subtotal', totLabelX, y);
  doc.fillColor(BLACK).text(`KES ${subtotal.toFixed(2)}`, totLabelX, y, { width: contentW, align: 'right' });
  y += 12;

  doc.fillColor(GREY).text('VAT (16%)', totLabelX, y);
  doc.fillColor(BLACK).text(`KES ${tax.toFixed(2)}`, totLabelX, y, { width: contentW, align: 'right' });
  y += 18;

  solidLine(doc, margin, rightX, y - 3, BLUE, 0.6);
  y += 6;

  doc.font(FONT_BOLD).fontSize(13).fillColor(BLUE);
  doc.text('TOTAL', margin + 6, y);
  doc.text(`KES ${total.toFixed(2)}`, totLabelX, y, { width: contentW - 6, align: 'right' });
  y += 22;

  const pinValue = (sale.customer_pin && String(sale.customer_pin).trim() && sale.customer_pin !== 'N/A')
    ? String(sale.customer_pin).trim()
    : 'N/A';

  if (signed) {
    const cuId = sale.sdc_id || sale.cuId || 'KRACU0300003735';
    const cuInvoiceNo = `${cuId}/${sale.receipt_no || ''}`;
    const receiptRef = sale.invoice_no || 'N/A';

    solidLine(doc, margin, rightX, y - 4, LIGHT, 0.4);
    y += 2;

    doc.font(FONT).fontSize(10).fillColor(BLACK)
       .text('SCU Information', margin, y, { width: contentW, align: 'left' });
    y += 13;

    doc.font(FONT).fontSize(8.5).fillColor(BLACK)
       .text('CU Invoice No', margin, y, { width: contentW * 0.4, lineBreak: false });
    doc.font(FONT).fontSize(8.5).fillColor(BLACK)
       .text(cuInvoiceNo, margin, y, { width: contentW, align: 'right' });
    y += 12;

    doc.font(FONT).fontSize(8.5).fillColor(BLACK)
       .text('Customer PIN', margin, y, { width: contentW * 0.4, lineBreak: false });
    doc.font(FONT).fontSize(8.5).fillColor(BLACK)
       .text(pinValue, margin, y, { width: contentW, align: 'right' });
    y += 12;

    doc.font(FONT).fontSize(8.5).fillColor(BLACK)
       .text('Receipt Ref No', margin, y, { width: contentW * 0.4, lineBreak: false });
    doc.font(FONT).fontSize(8.5).fillColor(BLACK)
       .text(receiptRef, margin, y, { width: contentW, align: 'right' });
    y += 12;
  }

  try {
    const target = buildQrTarget(sale, publicBase);
    const qrDataUrl = await QRCode.toDataURL(target, { width: 300, margin: 1 });
    const qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const qrSize = mmToPt(28);
    const qrX = (pageW - qrSize) / 2;
    if (!measureOnly) doc.image(qrBuf, qrX, y, { width: qrSize, height: qrSize });
    y += qrSize + 4;

    doc.font(FONT).fontSize(8).fillColor(GREY)
       .text(signed ? 'Scan to verify on KRA' : 'Scan to view receipt online',
         margin, y, { width: contentW, align: 'center' });
    y += 12;
  } catch (e) {
    console.warn('[PDF] qr failed:', e.message);
  }

  if (signed) {
    doc.font(FONT_BOLD).fontSize(10).fillColor(GREEN)
       .text('FISCAL RECEIPT', margin, y, { width: contentW, align: 'center' });
  } else {
    doc.font(FONT_BOLD).fontSize(10).fillColor(AMBER)
       .text('NON-FISCAL RECEIPT', margin, y, { width: contentW, align: 'center' });
    y += 12;
    doc.font(FONT).fontSize(8).fillColor(GREY)
       .text('Pending eTIMS sync — not a KRA tax invoice.', margin, y, { width: contentW, align: 'center' });
  }
  y += 16;

  solidLine(doc, margin, rightX, y, LIGHT, 0.4);
  y += 10;

  doc.font(FONT_BOLD).fontSize(10.5).fillColor(BLUE)
     .text('Thank you for your business!', margin, y, { width: contentW, align: 'center' });
  y += 12;

  doc.font(FONT).fontSize(7.5).fillColor(GREY)
     .text('Evopay Car Wash  |  KRA eTIMS VSCU v2.0.21', margin, y, { width: contentW, align: 'center' });

  return y;
}

async function streamReceiptPdf(sale, publicBase, res) {
  const widthMM = 100;

  // ---- Pass 1: measure with tall dummy page ----
  const measureDoc = new PDFDocument({
    size: [mmToPt(widthMM), mmToPt(2000)],
    margin: mmToPt(8),
    bufferPages: false,
  });
  measureDoc.on('data', () => {});
  const usedY = await renderPass(sale, publicBase, measureDoc, true);
  measureDoc.end();

  // Content height + bottom margin + safety tail (prevents page overflow)
  const pageHMM = Math.max(60, (usedY / 2.8346) + 8 + 6);

  // ---- Pass 2: real render with exact height ----
  const doc = new PDFDocument({
    size: [mmToPt(widthMM), mmToPt(pageHMM)],
    margin: mmToPt(8),
    bufferPages: false,
    autoFirstPage: true,
    info: {
      Title: `Receipt ${sale.invoice_no}`,
      Author: 'Evopay Car Wash',
      Subject: 'Receipt',
    },
  });

  doc.pipe(res);
  await renderPass(sale, publicBase, doc, false);
  doc.end();
}

module.exports = { streamReceiptPdf };