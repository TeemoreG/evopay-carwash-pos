import React, { useRef, useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { toast } from 'react-toastify';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { printReceipt, getCachedConfig, fetchPrinterConfig } from '../../utils/printer';

// Bridge to native printer (defined in MainActivity.java)
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

const generateQRCodeDataURL = async (saleData) => {
  try {
    const d = new Date(saleData.created_at || saleData.date || new Date().toISOString());
    const invoiceDate = String(d.getDate()).padStart(2, '0') +
      String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
    const invoiceTime = String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
    const cuId = saleData.cuId || 'KRACU0300003735';
    const cuReceiptNumber = saleData.invoice_no || '1';
    const internalData = saleData.internal_data || '';
    const signature = saleData.vscu_signature || '';
    const qrString = `${invoiceDate}#${invoiceTime}#${cuId}#${cuReceiptNumber}#${internalData}#${signature}`;
    return await QRCode.toDataURL(qrString, { width: 120, margin: 2, errorCorrectionLevel: 'M' });
  } catch (e) {
    console.error('QR Code generation failed:', e);
    return null;
  }
};

const getQRString = (saleData) => {
  try {
    const d = new Date(saleData.created_at || saleData.date || new Date().toISOString());
    const invoiceDate = String(d.getDate()).padStart(2, '0') +
      String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
    const invoiceTime = String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
    const cuId = saleData.cuId || 'KRACU0300003735';
    const cuReceiptNumber = saleData.invoice_no || '1';
    const internalData = saleData.internal_data || '';
    const signature = saleData.vscu_signature || '';
    return `${invoiceDate}#${invoiceTime}#${cuId}#${cuReceiptNumber}#${internalData}#${signature}`;
  } catch {
    return '';
  }
};

// Build a plain-text receipt for ESC/POS printers
const buildPlainTextReceipt = (sale) => {
  const line = '-'.repeat(32);
  const eq = '='.repeat(32);
  const items = sale.items || [];
  const paymentLabel = getPaymentLabel(sale);
  const dateStr = formatDateTime(sale.created_at || sale.date || new Date().toISOString());

  let txt = '';
  txt += '        EVOPAY CAR WASH\n';
  txt += '      eTIMS Compliant Receipt\n';
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
  txt += sale.synced === 1
    ? '      KRA eTIMS Verified\n'
    : '      Pending VSCU Sync\n';
  txt += `SCU: ${sale.scuId || 'EVO-VSCU-001'}\n`;
  txt += `CU:  ${sale.cuId || `CU-${String(Date.now()).slice(-6)}`}\n`;
  txt += `${line}\n`;
  txt += '   Thank you for your business!\n';
  txt += '     KRA eTIMS VSCU v2.0.21\n';
  txt += '\n\n\n\n';
  return txt;
};

// ---------- PDF generation (web + fallback) ----------
export const generateThermalReceipt = async (saleData, logoRef = null) => {
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

    let qrCodeDataURL = null;
    try { qrCodeDataURL = await generateQRCodeDataURL(saleData); } catch {}

    const tempDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
    tempDoc.setFont('courier', 'normal');
    tempDoc.setFontSize(7);

    let itemsHeight = 0;
    items.forEach((item) => {
      const splitName = tempDoc.splitTextToSize(item.item_name || item.name || 'Unknown', 30);
      itemsHeight += splitName.length * 3.5 + 2;
    });

    const qrHeight = qrCodeDataURL ? 30 : 0;
    const totalHeight = 130 + qrHeight + (items.length ? itemsHeight : 10);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, totalHeight],
      compress: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 5;
    const leftCol = margin;
    const rightCol = pageWidth - margin;
    const blue = [26, 42, 74];
    let y = margin + 2;

    if (logoRef?.current?.complete && logoRef.current.naturalWidth !== 0) {
      const el = logoRef.current;
      const logoHeight = 14;
      const logoWidth = (el.naturalWidth / el.naturalHeight) * logoHeight;
      doc.addImage(el, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
      y += logoHeight + 3;
    } else {
      y += 3;
    }

    doc.setFont('courier', 'bold').setFontSize(8).setTextColor(...blue);
    doc.text('eTIMS Compliant Receipt', pageWidth / 2, y, { align: 'center' });
    y += 4;
    doc.setFontSize(9);
    doc.text(`Invoice: ${saleData.invoice_no || 'N/A'}`, pageWidth / 2, y, { align: 'center' });
    y += 5;

    doc.setDrawColor(...blue).setLineWidth(0.2).line(margin, y, pageWidth - margin, y);
    y += 4;

    doc.setFont('courier', 'normal').setFontSize(7).setTextColor(0, 0, 0);
    const paymentLabel = getPaymentLabel(saleData);
    const dateStr = formatDateTime(saleData.created_at || saleData.date || new Date().toISOString());

    doc.text(`Cashier: ${saleData.user_name || saleData.cashier || 'Unknown'}`, leftCol, y);
    doc.text(`Customer: ${saleData.customer || 'Walk-in'}`, rightCol, y, { align: 'right' });
    y += 4;
    doc.text(`Date: ${dateStr}`, leftCol, y);
    doc.text('Type: Normal Sale', rightCol, y, { align: 'right' });
    y += 4;
    doc.text(`Payment: ${paymentLabel}`, leftCol, y);
    y += 4;
    if (saleData.customer_pin && saleData.customer_pin !== 'N/A' && saleData.customer_pin !== '') {
      doc.text(`PIN: ${saleData.customer_pin}`, leftCol, y);
      y += 4;
    }

    y += 1;
    doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
    y += 4;

    if (items.length) {
      const xItem = leftCol, xQty = 50, xPrice = 58, xTotal = 72;
      doc.setFont('courier', 'bold').setFontSize(7).setTextColor(...blue);
      doc.text('ITEM', xItem, y);
      doc.text('QTY', xQty, y, { align: 'center' });
      doc.text('PRICE', xPrice, y, { align: 'center' });
      doc.text('TOTAL', xTotal, y, { align: 'center' });
      y += 3;
      doc.setDrawColor(...blue).setLineWidth(0.15).line(margin, y, pageWidth - margin, y);
      y += 3;

      doc.setFont('courier', 'normal').setTextColor(0, 0, 0);
      items.forEach((item) => {
        const qty = item.quantity || 0;
        const price = item.price || 0;
        const amount = qty * price;
        const name = item.item_name || item.name || 'Unknown';
        const lines = doc.splitTextToSize(name, 35);
        doc.text(lines, xItem, y);
        const lineY = y + (lines.length - 1) * 3.5;
        doc.text(`${qty}`, xQty, lineY, { align: 'center' });
        doc.text(`${price.toFixed(2)}`, xPrice, lineY, { align: 'center' });
        doc.text(`${amount.toFixed(2)}`, xTotal, lineY, { align: 'center' });
        y += lines.length * 3.5 + 2;
      });

      y += 2;
      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 4;

      doc.setFont('courier', 'normal').setFontSize(8).setTextColor(...blue);
      doc.text('Subtotal:', leftCol, y);
      doc.text(`KES ${subtotal.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 4;
      doc.text('VAT (16%):', leftCol, y);
      doc.text(`KES ${tax.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 4;
      doc.setFont('courier', 'bold').setFontSize(9);
      doc.text('TOTAL:', leftCol, y);
      doc.text(`KES ${total.toFixed(2)}`, rightCol, y, { align: 'right' });
      y += 5;

      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 4;

      doc.setFont('courier', 'normal').setFontSize(7);
      if (saleData.synced === 1 && saleData.vscu_signature) {
        doc.setTextColor(0, 130, 0);
        doc.text('KRA eTIMS Verified', pageWidth / 2, y, { align: 'center' });
      } else {
        doc.setTextColor(180, 120, 0);
        doc.text('Pending VSCU Sync', pageWidth / 2, y, { align: 'center' });
      }
      y += 4;

      doc.setTextColor(0, 0, 0);
      doc.text(`SCU: ${saleData.scuId || 'EVO-VSCU-001'}`, leftCol, y);
      doc.text(`CU: ${saleData.cuId || `CU-${String(Date.now()).slice(-6)}`}`, rightCol, y, { align: 'right' });
      y += 5;

      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 4;

      if (qrCodeDataURL) {
        const qrSize = 22;
        try {
          doc.addImage(qrCodeDataURL, 'PNG', (pageWidth - qrSize) / 2, y, qrSize, qrSize);
          y += qrSize + 2;
          doc.setFontSize(5).setTextColor(100, 100, 100);
          doc.text('Scan to verify with KRA', pageWidth / 2, y, { align: 'center' });
          y += 4;
        } catch {}
      }

      y += 1;
      doc.setDrawColor(...blue).line(margin, y, pageWidth - margin, y);
      y += 4;

      doc.setFont('courier', 'normal').setFontSize(8).setTextColor(...blue);
      doc.text('Thank you for your business!', pageWidth / 2, y, { align: 'center' });
      y += 4;
      doc.setFontSize(6).setTextColor(100, 100, 100);
      doc.text('KRA eTIMS VSCU v2.0.21', pageWidth / 2, y, { align: 'center' });
    } else {
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
  const [qrString, setQrString] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printerCfg, setPrinterCfg] = useState(getCachedConfig());

  useEffect(() => {
    if (sale) {
      generateQRCodeDataURL(sale).then((qr) => {
        setQrCodeData(qr);
        setQrString(getQRString(sale));
      });
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

  // ---------- Native print (Android APK) ----------
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

  // ---------- Web print ----------
  // Tries configured printer (network/serial/usb) first.
  // Falls back to PDF-in-new-window if that fails or mode is 'browser'.
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
          console.warn('Native print failed, falling back to PDF:', nativeErr);
          toast.info('Printer unavailable — opening PDF');
        }
      }

      const doc = await generateThermalReceipt(sale, logoRef);
      if (!doc) throw new Error('PDF generation failed');
      const url = URL.createObjectURL(doc.output('blob'));
      const win = window.open(url);
      if (win) win.onload = () => win.print();
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
      const doc = await generateThermalReceipt(sale, logoRef);
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
            <div className="p-4 font-mono text-[10px]">
              <div className="flex justify-center mb-2">
                <img
                  ref={logoRef}
                  src="/evopay-logo.png"
                  alt="Evopay Logo"
                  className="h-12 object-contain"
                  onError={(e) => (e.target.style.display = 'none')}
                />
              </div>
              <div className="text-center font-bold text-[#1a2a4a] text-xs">
                eTIMS Compliant Receipt
              </div>
              <div className="text-center font-bold text-[#1a2a4a] text-sm mt-1">
                Invoice: {sale.invoice_no || 'N/A'}
              </div>
              <hr className="border-[#1a2a4a] my-2" />

              <div className="text-[8px] leading-relaxed">
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

              <div className="flex font-bold text-[#1a2a4a] text-[8px]">
                <div className="flex-1">ITEM</div>
                <div className="w-8 text-center">QTY</div>
                <div className="w-12 text-center">PRICE</div>
                <div className="w-14 text-center">TOTAL</div>
              </div>
              <hr className="border-[#1a2a4a] my-1" />

              <div className="text-[8px] leading-relaxed">
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
                        <div className="w-12 text-center">{price.toFixed(2)}</div>
                        <div className="w-14 text-center">{amount.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              <div className="text-[10px] leading-relaxed">
                <div className="flex justify-between">
                  <span className="text-[#1a2a4a]">Subtotal:</span>
                  <span className="text-[#1a2a4a]">KES {(sale.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1a2a4a]">VAT (16%):</span>
                  <span className="text-[#1a2a4a]">KES {(sale.tax || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#1a2a4a] text-sm">
                  <span>TOTAL:</span>
                  <span>KES {(sale.total || 0).toFixed(2)}</span>
                </div>
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              <div className="text-center text-[8px]">
                {sale.synced === 1 && sale.vscu_signature
                  ? <div className="text-green-700">KRA eTIMS Verified</div>
                  : <div className="text-amber-600">Pending VSCU Sync</div>}
              </div>

              <div className="flex justify-between text-[8px] mt-1">
                <span>SCU: {sale.scuId || 'EVO-VSCU-001'}</span>
                <span>CU: {sale.cuId || `CU-${String(Date.now()).slice(-6)}`}</span>
              </div>

              <hr className="border-[#1a2a4a] my-2" />

              {qrCodeData && (
                <div className="text-center my-2">
                  <img src={qrCodeData} alt="KRA QR" className="mx-auto" style={{ width: '80px', height: '80px' }} />
                  <div className="text-[6px] text-gray-600 mt-1">Click to verify with KRA</div>
                </div>
              )}

              <div className="text-center text-[#1a2a4a] text-[10px]">
                Thank you for your business!
              </div>
              <div className="text-center text-gray-500 text-[7px]">
                KRA eTIMS VSCU v2.0.21
              </div>
            </div>
          </div>
        </div>

        {/* Actions — responsive */}
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