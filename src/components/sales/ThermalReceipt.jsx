import React, { useRef, useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { toast } from 'react-toastify';
import { registerPlugin, Capacitor } from '@capacitor/core';

const NativePrinter = registerPlugin('TelpoPrinter');
const isNative = Capacitor.isNativePlatform();

// ---------- Logo (self-loading, cached) ----------
let cachedLogo = null;
let cachedLogoPromise = null;

const loadLogoDataURL = () => {
  if (cachedLogo) return Promise.resolve(cachedLogo);
  if (cachedLogoPromise) return cachedLogoPromise;
  cachedLogoPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedLogo = img;
      resolve(img);
    };
    img.onerror = () => {
      console.warn('logo load failed');
      cachedLogoPromise = null;
      resolve(null);
    };
    img.src = '/evopay-logo.jpg';
  });
  return cachedLogoPromise;
};

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
    return `${day}/${month}/${year} ${hours}:${minutes}`;
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
  const cuId = saleData.sdc_id || saleData.cuId || 'KRACU0300003735';
  const cuReceiptNumber = saleData.invoice_no || '1';
  const internalData = saleData.internal_data || '';
  const signature = saleData.vscu_signature || '';
  return `${invoiceDate}#${invoiceTime}#${cuId}#${cuReceiptNumber}#${internalData}#${signature}`;
};

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
    return await QRCode.toDataURL(target, { width: 220, margin: 0, errorCorrectionLevel: 'M' });
  } catch (e) {
    console.error('QR Code generation failed:', e);
    return null;
  }
};

const getCuInvoiceNo = (sale) => {
  const cuId = sale.sdc_id || sale.cuId || 'KRACU0300003735';
  return `${cuId}/${sale.receipt_no || ''}`;
};

const getPinValue = (sale) => {
  return (sale.customer_pin && String(sale.customer_pin).trim() && sale.customer_pin !== 'N/A')
    ? String(sale.customer_pin).trim()
    : 'N/A';
};

// Native plain-text receipt (Android Telpo)
const buildPlainTextReceipt = (sale) => {
  const line = '-'.repeat(32);
  const eq = '='.repeat(32);
  const items = sale.items || [];
  const paymentLabel = getPaymentLabel(sale);
  const dateStr = formatDateTime(sale.created_at || sale.date || new Date().toISOString());
  const kraPin = import.meta.env.VITE_VSCU_TIN || '';
  const signed = isSigned(sale);

  let txt = '';
  txt += '        CAR WASH\n';
  txt += '   eTIMS Compliant Receipt\n';
  if (kraPin) txt += `      KRA PIN: ${kraPin}\n`;
  txt += `Invoice: ${sale.invoice_no || 'N/A'}\n`;
  txt += `${eq}\n`;
  txt += `Cashier: ${sale.user_name || sale.cashier || 'Unknown'}\n`;
  txt += `Customer: ${sale.customer || 'Walk-in'}\n`;
  txt += `Date: ${dateStr}\n`;
  txt += `Payment: ${paymentLabel}\n`;
  txt += `${line}\n`;
  txt += 'ITEM                QTY    TOTAL\n';
  txt += `${line}\n`;

  items.forEach((item) => {
    const qty = item.quantity || 0;
    const price = item.price || 0;
    const amount = item.total || qty * price;
    let name = item.item_name || item.name || 'Unknown';
    if (name.length > 18) name = name.substring(0, 18);
    txt += name.padEnd(18) + String(qty).padStart(4) + amount.toFixed(2).padStart(10) + '\n';
  });

  txt += `${line}\n`;
  txt += `Subtotal:`.padEnd(20) + `KES ${(sale.subtotal || 0).toFixed(2)}\n`;
  txt += `VAT (16%):`.padEnd(20) + `KES ${(sale.tax || 0).toFixed(2)}\n`;
  txt += `TOTAL:`.padEnd(20) + `KES ${(sale.total || 0).toFixed(2)}\n`;

  if (signed) {
    txt += `${line}\n`;
    txt += 'SCU Information\n';
    txt += `CU Invoice No: ${getCuInvoiceNo(sale)}\n`;
    txt += `Customer PIN: ${getPinValue(sale)}\n`;
    txt += `Receipt Ref No: ${sale.invoice_no || 'N/A'}\n`;
  }

  txt += `${eq}\n`;
  txt += signed ? '     FISCAL RECEIPT\n' : '   NON-FISCAL RECEIPT\n';
  txt += `${line}\n`;
  txt += '  Thank you for your business!\n';
  txt += '  Evopay Car Wash | KRA eTIMS v2.0.21\n';
  txt += '\n\n\n\n';
  return txt;
};

// ---------- PDF generation ----------
export const generateThermalReceipt = async (saleData, logoRef = null, paperWidthMM = 58) => {
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

    let logoEl = null;
    if (logoRef?.current?.complete && logoRef.current.naturalWidth !== 0) {
      logoEl = logoRef.current;
    } else {
      try { logoEl = await loadLogoDataURL(); } catch {}
    }

    const isNarrow = paperWidthMM <= 58;
    const margin = 2.5;
    const bodyFont = isNarrow ? 9.5 : 10.5;
    const itemFont = isNarrow ? 8.5 : 9.5;
    const brandFont = isNarrow ? 13 : 14;
    const totalFont = isNarrow ? 13 : 14;
    const footerFont = isNarrow ? 7.5 : 8;
    const scuFont = isNarrow ? 8.5 : 9.5;
    const qrSize = isNarrow ? 24 : 28;
    const lineH = 4.5;
    const itemLineH = 4.0;
    const scuLineH = 4.2;

    const usableWidth = paperWidthMM - margin * 2;
    const nameColWidth = usableWidth * 0.52;

    const tempDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [paperWidthMM, 300] });
    tempDoc.setFont('courier', 'normal');
    tempDoc.setFontSize(itemFont);

    let itemsHeight = 0;
    items.forEach((item) => {
      const splitName = tempDoc.splitTextToSize(item.item_name || item.name || 'Unknown', nameColWidth);
      itemsHeight += splitName.length * itemLineH + 1.5;
    });

    const headerHeight = 80;
    const metaHeight = 24;
    const scuHeight = signed ? 34 : 0;
    const qrBlockHeight = qrCodeDataURL ? qrSize + 10 : 0;
    const footerHeight = 20;
    const itemsBlock = items.length ? itemsHeight + 46 : 15;
    const totalHeight = headerHeight + metaHeight + itemsBlock + scuHeight + qrBlockHeight + footerHeight;

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

    const xItem = leftCol;
    const xQty = leftCol + usableWidth * 0.60;
    const xTotal = rightCol;

    if (logoEl) {
      try {
        const logoWidth = usableWidth * 0.45;
        const logoHeight = (logoEl.naturalHeight / logoEl.naturalWidth) * logoWidth;
        doc.addImage(logoEl, 'JPEG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight, undefined, 'FAST');
        y += logoHeight + 1;
      } catch (e) {
        console.warn('logo addImage failed:', e);
      }
    }

    doc.setFont('courier', 'bold').setFontSize(brandFont).setTextColor(...blue);
    doc.text('CAR WASH', pageWidth / 2, y, { align: 'center' });
    y += 5.5;

    doc.setFont('courier', 'normal').setFontSize(bodyFont).setTextColor(...black);
    doc.text('eTIMS Compliant Receipt', pageWidth / 2, y, { align: 'center' });
    y += 4.5;

    const kraPin = import.meta.env.VITE_VSCU_TIN || '';
    if (kraPin) {
      doc.setFont('courier', 'normal').setFontSize(bodyFont - 0.5).setTextColor(110, 110, 110);
      doc.text(`KRA PIN: ${kraPin}`, pageWidth / 2, y, { align: 'center' });
      y += 4.5;
    }

    y += 1;
    doc.setDrawColor(...blue).setLineWidth(0.4).line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFont('courier', 'normal').setFontSize(bodyFont).setTextColor(85, 85, 85);
    const paymentLabel = getPaymentLabel(saleData);
    const dateStr = formatDateTime(saleData.created_at || saleData.date || new Date().toISOString());
    const metaRows = [
      ['Invoice', saleData.invoice_no || 'N/A'],
      ['Cashier', saleData.user_name || saleData.cashier || 'Unknown'],
      ['Customer', saleData.customer || 'Walk-in'],
      ['Date', dateStr],
      ['Payment', paymentLabel],
    ];
    metaRows.forEach(([k, v]) => {
      doc.text(k, leftCol, y);
      doc.text(String(v), rightCol, y, { align: 'right' });
      y += lineH;
    });
    y += 1.5;

    doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
    y += 5;

    if (items.length) {
      doc.setFont('courier', 'bold').setFontSize(itemFont).setTextColor(...blue);
      doc.text('ITEM', xItem, y);
      doc.text('QTY', xQty, y, { align: 'right' });
      doc.text('TOTAL', xTotal, y, { align: 'right' });
      y += 4;
      doc.setDrawColor(...blue).setLineWidth(0.2).line(margin, y, pageWidth - margin, y);
      y += 4.5;

      doc.setFont('courier', 'normal').setFontSize(itemFont).setTextColor(...black);
      items.forEach((item) => {
        const qty = item.quantity || 0;
        const price = item.price || 0;
        const amount = item.total || qty * price;
        const name = item.item_name || item.name || 'Unknown';
        const lines = doc.splitTextToSize(name, nameColWidth);
        doc.text(lines, xItem, y);
        doc.text(`${qty}`, xQty, y, { align: 'right' });
        doc.text(`${amount.toFixed(0)}`, xTotal, y, { align: 'right' });
        y += lines.length * itemLineH + 1.5;
      });

      y += 1.5;
      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 5;

      doc.setFont('courier', 'normal').setFontSize(bodyFont).setTextColor(110, 110, 110);
      doc.text('Subtotal', leftCol, y);
      doc.setTextColor(...black);
      doc.text(`KES ${subtotal.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += lineH;
      doc.setTextColor(110, 110, 110);
      doc.text('VAT (16%)', leftCol, y);
      doc.setTextColor(...black);
      doc.text(`KES ${tax.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += lineH + 1.5;

      doc.setFont('courier', 'bold').setFontSize(totalFont).setTextColor(...black);
      doc.text('TOTAL', leftCol, y);
      doc.text(`KES ${total.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 7;

      doc.setDrawColor(...blue).setLineWidth(0.4).line(margin, y, pageWidth - margin, y);
      y += 5;

      if (signed) {
        doc.setFont('courier', 'bold').setFontSize(scuFont).setTextColor(...black);
        doc.text('SCU Information', leftCol, y);
        y += scuLineH + 0.5;

        const scuRows = [
          ['CU Invoice No', getCuInvoiceNo(saleData)],
          ['Customer PIN', getPinValue(saleData)],
          ['Receipt Ref No', saleData.invoice_no || 'N/A'],
        ];

        scuRows.forEach(([label, value]) => {
          doc.setFont('courier', 'normal').setFontSize(scuFont - 0.5).setTextColor(110, 110, 110);
          doc.text(label, leftCol, y);
          y += scuLineH - 0.5;

          doc.setFont('courier', 'normal').setFontSize(scuFont).setTextColor(...black);
          doc.text(String(value), leftCol, y);
          y += scuLineH + 0.5;
        });

        y += 0.5;
        doc.setDrawColor(...blue).setLineWidth(0.3).line(margin, y, pageWidth - margin, y);
        y += 5;
      }

      doc.setFont('courier', 'bold').setFontSize(bodyFont + 0.5);
      if (signed) {
        doc.setTextColor(0, 110, 0);
        doc.text('FISCAL RECEIPT', pageWidth / 2, y, { align: 'center' });
      } else {
        doc.setTextColor(160, 100, 0);
        doc.text('NON-FISCAL RECEIPT', pageWidth / 2, y, { align: 'center' });
        y += 4.5;
        doc.setFont('courier', 'normal').setFontSize(footerFont).setTextColor(110, 110, 110);
        doc.text('Pending eTIMS sync', pageWidth / 2, y, { align: 'center' });
      }
      y += 7;

      if (qrCodeDataURL) {
        try {
          doc.addImage(qrCodeDataURL, 'PNG', (pageWidth - qrSize) / 2, y, qrSize, qrSize);
          y += qrSize + 3;
          doc.setFont('courier', 'normal').setFontSize(footerFont).setTextColor(110, 110, 110);
          doc.text(
            signed ? 'Scan to verify on KRA' : 'Scan to view receipt',
            pageWidth / 2,
            y,
            { align: 'center' }
          );
          y += 4.5;
        } catch {}
      }

      y += 2;
      doc.setDrawColor(200, 200, 200).setLineWidth(0.3).line(margin, y, pageWidth - margin, y);
      y += 5;

      doc.setFont('courier', 'bold').setFontSize(bodyFont + 0.5).setTextColor(...blue);
      doc.text('Thank you for your business!', pageWidth / 2, y, { align: 'center' });
      y += 5;
      doc.setFont('courier', 'normal').setFontSize(footerFont).setTextColor(120, 120, 120);
      doc.text(
        'Evopay Car Wash  |  KRA eTIMS VSCU v2.0.21',
        pageWidth / 2,
        y,
        { align: 'center' }
      );
      y += 6;
    } else {
      doc.setFont('courier', 'normal').setFontSize(bodyFont).setTextColor(...black);
      doc.text('No items found', margin, y + 5);
    }

    return doc;
  } catch (e) {
    console.error('Error generating thermal receipt:', e);
    return null;
  }
};

// ---------- Component ----------
const ThermalReceipt = ({
  sale,
  onClose,
  onDownload,
  onSendSms,
  smsSending,
  smsPhone,
  setSmsPhone,
}) => {
  const logoRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [nativePrinting, setNativePrinting] = useState(false);

  const signed = isSigned(sale);
  const paymentLabel = getPaymentLabel(sale);
  const invoiceNo = sale?.invoice_no || sale?.id || 'N/A';
  const createdAt = sale?.created_at || sale?.date;

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Web download (same as Sales History button)
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const doc = await generateThermalReceipt(sale, logoRef, 58);
      if (!doc) throw new Error('PDF generation failed');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${sale.invoice_no || sale.id || Date.now()}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Receipt downloaded');
      if (onDownload) onDownload();
    } catch (e) {
      console.error(e);
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  // Native Android (Telpo) — text print
  const handleNativePrint = async () => {
    setNativePrinting(true);
    try {
      const text = buildPlainTextReceipt(sale);
      await NativePrinter.printText({ text });
      toast.success('Receipt printed');
    } catch (err) {
      console.error('Print failed:', err);
      toast.error('Print failed: ' + (err.message || 'Unknown error'));
    } finally {
      setNativePrinting(false);
    }
  };

  const smsDigits = (smsPhone || '').replace(/\D/g, '');
  const smsValid = smsDigits.length === 10 && /^0[17]/.test(smsDigits);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-[#1a2a4a]">{invoiceNo}</h2>
            <p className="text-xs text-slate-400">
              {createdAt ? new Date(createdAt).toLocaleString('en-KE') : 'N/A'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Tiles */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-[10px] uppercase">Customer</p>
              <p className="font-semibold text-slate-700 truncate">{sale.customer || 'Walk-in'}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-[10px] uppercase">Cashier</p>
              <p className="font-semibold text-slate-700 truncate">{sale.user_name || sale.cashier || '—'}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-[10px] uppercase">Payment</p>
              <p className="font-semibold text-slate-700">{paymentLabel}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-slate-400 text-[10px] uppercase">Sync</p>
              <p className={`font-semibold ${signed ? 'text-emerald-600' : 'text-amber-600'}`}>
                {signed ? 'Synced' : 'Pending'}
              </p>
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-slate-200 pt-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Items</p>
            <div className="space-y-1.5">
              {(sale.items || []).map((it, i) => {
                const qty = it.quantity || 0;
                const price = Number(it.price || 0);
                const lineTotal = Number(it.total || qty * price);
                return (
                  <div key={i} className="flex justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-700 truncate">{it.item_name || it.name || 'Item'}</p>
                      <p className="text-[10px] text-slate-400">{qty} × {price.toLocaleString()}</p>
                    </div>
                    <span className="font-semibold text-slate-800 ml-2">
                      KES {lineTotal.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span>KES {Number(sale.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">VAT</span>
              <span>KES {Number(sale.tax || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-[#1a2a4a] text-base pt-1">
              <span>Total</span>
              <span>KES {Number(sale.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* SCU Information */}
          {signed && (
            <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">SCU Information</p>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">CU Invoice No</span>
                <span className="font-mono text-slate-800 text-right break-all">{getCuInvoiceNo(sale)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">Customer PIN</span>
                <span className="font-mono text-slate-800 text-right break-all">{getPinValue(sale)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">Receipt Ref No</span>
                <span className="font-mono text-slate-800 text-right break-all">{sale.invoice_no || 'N/A'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          {/* SMS */}
          {onSendSms && (
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="numeric"
                value={smsPhone || ''}
                onChange={(e) => setSmsPhone && setSmsPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="07XX XXX XXX"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
              />
              <button
                onClick={onSendSms}
                disabled={smsSending || !smsValid}
                className="px-4 py-2 bg-[#1a2a4a] hover:bg-[#0f1a33] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {smsSending ? '...' : 'Send SMS'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {isNative ? (
              <button
                onClick={handleNativePrint}
                disabled={nativePrinting}
                className="flex-1 py-2.5 bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {nativePrinting ? 'Printing...' : 'Print Receipt'}
              </button>
            ) : (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex-1 py-2.5 bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {downloading ? 'Generating...' : 'Download Receipt'}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThermalReceipt;