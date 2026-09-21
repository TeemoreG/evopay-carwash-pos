import React, { useRef, useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { toast } from 'react-toastify';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { printReceipt, getCachedConfig, fetchPrinterConfig } from '../../utils/printer';

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

// Native plain-text receipt
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

      // SCU Information — stacked layout for long values
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
const ThermalReceipt = ({ sale, onClose, onDownload, onPrint }) => {
  const logoRef = useRef(null);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printerCfg, setPrinterCfg] = useState(getCachedConfig());

  const signed = isSigned(sale);
  const cuInvoiceNo = getCuInvoiceNo(sale);
  const pinValue = getPinValue(sale);

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

  const getPaperWidthMM = () => {
    const raw = printerCfg?.width ?? printerCfg?.paperWidth ?? 58;
    const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
    return n === 80 ? 80 : 58;
  };

  const downloadPdf = async () => {
    const doc = await generateThermalReceipt(sale, logoRef, getPaperWidthMM());
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
  };

  // Native Android — Telpo printer (unchanged)
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

  // Web — download PDF (identical output to Sales History Download button)
  const handleWebPrint = async () => {
    setPrinting(true);
    try {
      await downloadPdf();
      toast.success('Receipt saved — open to print');
      if (onPrint) onPrint();
    } catch (e) {
      console.error(e);
      toast.error('Print failed: ' + (e.message || 'Unknown'));
    } finally {
      setPrinting(false);
    }
  };

  const handleDownload = async () => {
    try {
      await downloadPdf();
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

        <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
          <div className="max-w-[80mm] mx-auto bg-white shadow-lg">
            <div className="p-4 font-mono text-[11px]">
              <div className="flex justify-center mb-3">
                <img
                  ref={logoRef}
                  src="/evopay-logo.jpg"
                  alt="Evopay Logo"
                  className="h-14 object-contain"
                  onError={(e) => (e.target.style.display = 'none')}
                />
              </div>

              <div className="text-center font-bold text-[#1a2a4a] text-sm">
                CAR WASH
              </div>
              <div className="text-center text-black text-xs mt-1">
                eTIMS Compliant Receipt
              </div>
              {kraPin && (
                <div className="text-center text-gray-600 text-[10px] mt-1">
                  KRA PIN: {kraPin}
                </div>
              )}
              <hr className="border-[#1a2a4a] my-3" />

              <div className="text-[11px] leading-relaxed text-gray-700 space-y-0.5">
                <div className="flex justify-between"><span>Invoice</span><span>{sale.invoice_no || 'N/A'}</span></div>
                <div className="flex justify-between"><span>Cashier</span><span>{sale.user_name || sale.cashier || 'Unknown'}</span></div>
                <div className="flex justify-between"><span>Customer</span><span>{sale.customer || 'Walk-in'}</span></div>
                <div className="flex justify-between"><span>Date</span><span>{formatDateTime(sale.created_at || sale.date || new Date().toISOString())}</span></div>
                <div className="flex justify-between"><span>Payment</span><span>{paymentLabel}</span></div>
              </div>

              <hr className="border-[#1a2a4a] my-3" />

              <div className="flex font-bold text-[#1a2a4a] text-[10px]">
                <div className="flex-1">ITEM</div>
                <div className="w-8 text-right">QTY</div>
                <div className="w-16 text-right">TOTAL</div>
              </div>
              <hr className="border-[#1a2a4a] my-1.5" />

              <div className="text-[10px] leading-relaxed text-black space-y-1">
                {(sale.items || []).map((item, idx) => {
                  const qty = item.quantity || 0;
                  const price = item.price || 0;
                  const amount = item.total || qty * price;
                  const name = item.item_name || item.name || 'Unknown';
                  return (
                    <div key={idx} className="flex gap-1 items-start">
                      <div className="flex-1 break-words">{name}</div>
                      <div className="w-8 text-right shrink-0">{qty}</div>
                      <div className="w-16 text-right shrink-0">{amount.toFixed(0)}</div>
                    </div>
                  );
                })}
              </div>

              <hr className="border-[#1a2a4a] my-3" />

              <div className="text-[11px] leading-relaxed space-y-0.5">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span className="text-black">KES {(sale.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>VAT (16%)</span>
                  <span className="text-black">KES {(sale.tax || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-black text-sm mt-2">
                  <span>TOTAL</span>
                  <span>KES {(sale.total || 0).toFixed(2)}</span>
                </div>
              </div>

              {signed && (
                <>
                  <hr className="border-gray-300 my-3" />
                  <div className="text-[10px] leading-relaxed text-black space-y-2">
                    <div className="font-bold mb-1">SCU Information</div>

                    <div>
                      <div className="text-gray-600 text-[9px]">CU Invoice No</div>
                      <div className="break-all">{cuInvoiceNo}</div>
                    </div>

                    <div>
                      <div className="text-gray-600 text-[9px]">Customer PIN</div>
                      <div className="break-all">{pinValue}</div>
                    </div>

                    <div>
                      <div className="text-gray-600 text-[9px]">Receipt Ref No</div>
                      <div className="break-all">{sale.invoice_no || 'N/A'}</div>
                    </div>
                  </div>
                </>
              )}

              <hr className="border-[#1a2a4a] my-3" />

              <div className="text-center text-[11px] font-bold">
                {signed
                  ? <div className="text-green-700">FISCAL RECEIPT</div>
                  : (
                    <>
                      <div className="text-amber-600">NON-FISCAL RECEIPT</div>
                      <div className="text-[9px] text-gray-500 font-normal mt-1">Pending eTIMS sync</div>
                    </>
                  )}
              </div>

              {qrCodeData && (
                <div className="text-center my-3">
                  <img src={qrCodeData} alt="Receipt QR" className="mx-auto" style={{ width: '100px', height: '100px' }} />
                  <div className="text-[8px] text-gray-700 mt-1.5">
                    {signed ? 'Scan to verify on KRA' : 'Scan to view receipt'}
                  </div>
                </div>
              )}

              <hr className="border-gray-300 my-3" />
              <div className="text-center text-[#1a2a4a] text-[11px] font-bold">
                Thank you for your business!
              </div>
              <div className="text-center text-gray-500 text-[8px] mt-1">
                Evopay Car Wash | KRA eTIMS VSCU v2.0.21
              </div>
            </div>
          </div>
        </div>

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
                Saving...
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