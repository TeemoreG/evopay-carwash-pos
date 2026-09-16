import { useRef } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import evopayLogo from '../../assets/evopay-logo.jpg';

const XReport = ({ data, loading }) => {
  const logoRef = useRef(null);

  const taxTypeLabels = {
    'A': 'Exempt (0%)',
    'B': 'Standard (16%)',
    'C': 'Zero Rated (0%)',
  };

  const paymentMethodLabels = {
    '01': 'Cash',
    '02': 'Card',
    '03': 'Mobile Money',
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 flex justify-center">
        <div className="h-6 w-6 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const downloadPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const primaryColor = [26, 42, 74];
      const accentColor = [244, 123, 32];

      const headerHeight = 55;

      // Header with Evopay branding
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, headerHeight, 'F');

      const imgElement = logoRef.current;
      if (imgElement && imgElement.complete && imgElement.naturalWidth !== 0) {
        const originalWidth = imgElement.naturalWidth;
        const originalHeight = imgElement.naturalHeight;
        const logoHeight = 14;
        const logoWidth = (originalWidth / originalHeight) * logoHeight;
        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = 5;
        doc.addImage(imgElement, 'PNG', logoX, logoY, logoWidth, logoHeight);
      } else {
        const fallbackWidth = 30;
        const fallbackX = (pageWidth - fallbackWidth) / 2;
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(fallbackX, 5, fallbackWidth, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('EVOPAY', pageWidth / 2, 13, { align: 'center' });
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('X Report - Interim Sales', pageWidth / 2, 28, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 200, 200);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 36, { align: 'center' });
      doc.text('KRA eTIMS Compliant VSCU v2.0.21', pageWidth / 2, 42, { align: 'center' });

      let yPos = 65;

      // ============================================
      // HEADER INFO - KRA Required Fields
      // ============================================
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('X REPORT SUMMARY', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Company: Evopay Limited`, 14, yPos);
      yPos += 5;
      doc.text(`TIN: ${import.meta.env.VITE_VSCU_TIN || 'P600003965A'}`, 14, yPos);
      yPos += 5;
      doc.text(`Branch: ${import.meta.env.VITE_VSCU_BHF_ID || '00'}`, 14, yPos);
      yPos += 5;
      doc.text(`Report Type: X Daily Report (Interim)`, 14, yPos);
      yPos += 5;
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
      yPos += 8;

      // ============================================
      // SALES SUMMARY - KRA Required
      // ============================================
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('SALES SUMMARY', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Total NS Receipts (Sales): ${data.totalSales || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Total NC Receipts (Credit Notes): ${data.totalCreditNotes || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Total NS Amount: KES ${(data.totalAmount || 0).toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Total NC Amount: KES ${(data.totalCreditAmount || 0).toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Tax Collected: KES ${(data.totalTax || 0).toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Items Sold: ${data.totalItems || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Discounts: KES ${(data.totalDiscounts || 0).toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Opening Cash: KES ${(data.openingDeposit || 0).toLocaleString()}`, 14, yPos);
      yPos += 8;

      // ============================================
      // RECEIPT TYPE BREAKDOWN - KRA Required
      // ============================================
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('RECEIPT TYPE BREAKDOWN', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Normal Sales (NS): ${data.totalSales || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Credit Notes (NC): ${data.totalCreditNotes || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Copies (CS/CC): ${data.copiesCount || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Training (TS/TC): ${data.trainingCount || 0}`, 14, yPos);
      yPos += 5;
      doc.text(`Proforma (PS): ${data.proformaCount || 0}`, 14, yPos);
      yPos += 8;

      // ============================================
      // TAX BREAKDOWN - KRA Required
      // ============================================
      if (data.taxBreakdown) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('TAX BREAKDOWN', 14, yPos);
        yPos += 6;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Tax Type`, 14, yPos);
        doc.text(`Taxable Amount`, 60, yPos);
        doc.text(`Tax Amount`, 100, yPos);
        yPos += 4;
        doc.line(14, yPos, 120, yPos);
        yPos += 4;
        
        Object.entries(data.taxBreakdown || {}).forEach(([type, values]) => {
          doc.text(`${taxTypeLabels[type] || type}`, 14, yPos);
          doc.text(`KES ${(values.amount || 0).toLocaleString()}`, 60, yPos);
          doc.text(`KES ${(values.tax || 0).toLocaleString()}`, 100, yPos);
          yPos += 5;
        });
        yPos += 8;
      }

      // ============================================
      // PAYMENT METHOD BREAKDOWN - KRA Required
      // ============================================
      if (data.paymentBreakdown && Object.keys(data.paymentBreakdown).length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('PAYMENT METHOD BREAKDOWN', 14, yPos);
        yPos += 6;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Payment Method`, 14, yPos);
        doc.text(`Count`, 60, yPos);
        doc.text(`Amount`, 90, yPos);
        yPos += 4;
        doc.line(14, yPos, 130, yPos);
        yPos += 4;
        
        Object.entries(data.paymentBreakdown || {}).forEach(([code, values]) => {
          doc.text(`${paymentMethodLabels[code] || code}`, 14, yPos);
          doc.text(`${values.count || 0}`, 60, yPos);
          doc.text(`KES ${(values.amount || 0).toLocaleString()}`, 90, yPos);
          yPos += 5;
        });
        yPos += 8;
      }

      // ============================================
      // FOOTER - KRA Required
      // ============================================
      const finalY = yPos + 10;
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, finalY, pageWidth, 25, 'F');
      doc.setFontSize(7);
      doc.setTextColor(200, 200, 200);
      doc.text('This X Report is KRA eTIMS compliant.', pageWidth / 2, finalY + 8, { align: 'center' });
      doc.text('This report shows sales since the last Z report.', pageWidth / 2, finalY + 14, { align: 'center' });
      doc.text('© Evopay Limited. All rights reserved.', pageWidth / 2, finalY + 20, { align: 'center' });

      doc.save('x-report.pdf');
    } catch (error) {
      console.error('PDF Download Error:', error);
      alert('Error downloading PDF: ' + error.message);
    }
  };

  const exportCSV = () => {
    try {
      const lines = [];

      lines.push('"Evopay VSCU Cashier System"');
      lines.push('"X Report - Interim Sales"');
      lines.push(`"Generated: ${new Date().toLocaleString()}"`);
      lines.push(`"TIN: ${import.meta.env.VITE_VSCU_TIN || 'P600003965A'}"`);
      lines.push('"KRA eTIMS Compliant"');
      lines.push('');

      // Sales Summary
      lines.push('"=== SALES SUMMARY ==="');
      lines.push(`"Total NS Receipts (Sales)","${data.totalSales || 0}"`);
      lines.push(`"Total NC Receipts (Credit Notes)","${data.totalCreditNotes || 0}"`);
      lines.push(`"Total NS Amount","KES ${(data.totalAmount || 0).toLocaleString()}"`);
      lines.push(`"Total NC Amount","KES ${(data.totalCreditAmount || 0).toLocaleString()}"`);
      lines.push(`"Total Tax Collected","KES ${(data.totalTax || 0).toLocaleString()}"`);
      lines.push(`"Total Items Sold","${data.totalItems || 0}"`);
      lines.push(`"Total Discounts","KES ${(data.totalDiscounts || 0).toLocaleString()}"`);
      lines.push(`"Opening Cash","KES ${(data.openingDeposit || 0).toLocaleString()}"`);
      lines.push('');

      // Receipt Type Breakdown
      lines.push('"=== RECEIPT TYPE BREAKDOWN ==="');
      lines.push(`"Normal Sales (NS)","${data.totalSales || 0}"`);
      lines.push(`"Credit Notes (NC)","${data.totalCreditNotes || 0}"`);
      lines.push(`"Copies (CS/CC)","${data.copiesCount || 0}"`);
      lines.push(`"Training (TS/TC)","${data.trainingCount || 0}"`);
      lines.push(`"Proforma (PS)","${data.proformaCount || 0}"`);
      lines.push('');

      // Tax Breakdown
      if (data.taxBreakdown) {
        lines.push('"=== TAX BREAKDOWN ==="');
        lines.push('"Tax Type","Taxable Amount (KES)","Tax Amount (KES)"');
        Object.entries(data.taxBreakdown || {}).forEach(([type, values]) => {
          lines.push(`"${taxTypeLabels[type] || type}","${(values.amount || 0).toLocaleString()}","${(values.tax || 0).toLocaleString()}"`);
        });
        lines.push('');
      }

      // Payment Method Breakdown
      if (data.paymentBreakdown) {
        lines.push('"=== PAYMENT METHOD BREAKDOWN ==="');
        lines.push('"Payment Method","Count","Amount (KES)"');
        Object.entries(data.paymentBreakdown || {}).forEach(([code, values]) => {
          lines.push(`"${paymentMethodLabels[code] || code}","${values.count || 0}","${(values.amount || 0).toLocaleString()}"`);
        });
        lines.push('');
      }

      lines.push(`"Generated: ${new Date().toLocaleString()}"`);
      lines.push('"Evopay Limited | KRA eTIMS Compliant VSCU v2.0.21"');

      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `x-report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV Export Error:', error);
      alert('Error exporting CSV: ' + error.message);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
      <img ref={logoRef} src={evopayLogo} alt="Evopay Logo" style={{ display: 'none' }} />

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[#1a2a4a]">X Report - Interim Sales</h2>
        <span className="text-xs text-gray-400">KRA eTIMS Compliant</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={downloadPDF}
          className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-3 py-1.5 rounded text-sm transition"
        >
          Download PDF
        </button>
        <button
          onClick={exportCSV}
          className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-3 py-1.5 rounded text-sm transition"
        >
          Export CSV
        </button>
      </div>

      {/* Sales Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">NS Receipts</p>
          <p className="text-2xl font-bold text-[#1a2a4a]">{data.totalSales || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">NC Receipts</p>
          <p className="text-2xl font-bold text-[#1a2a4a]">{data.totalCreditNotes || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Total Sales</p>
          <p className="text-2xl font-bold text-[#1a2a4a]">KES {(data.totalAmount || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Total Tax</p>
          <p className="text-2xl font-bold text-[#1a2a4a]">KES {(data.totalTax || 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Items Sold</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{data.totalItems || 0}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Discounts</p>
          <p className="text-lg font-bold text-[#1a2a4a]">KES {(data.totalDiscounts || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Opening Cash</p>
          <p className="text-lg font-bold text-[#1a2a4a]">KES {(data.openingDeposit || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Copies</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{data.copiesCount || 0}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Proforma</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{data.proformaCount || 0}</p>
        </div>
      </div>

      {/* Tax Breakdown */}
      {data.taxBreakdown && Object.keys(data.taxBreakdown).length > 0 && (
        <div className="border-t pt-4 mb-4">
          <h3 className="text-sm font-semibold text-[#1a2a4a] mb-2">Tax Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Tax Type</th>
                <th className="pb-2 font-medium text-right">Taxable Amount</th>
                <th className="pb-2 font-medium text-right">Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.taxBreakdown || {}).map(([type, values]) => (
                <tr key={type} className="border-b border-gray-50">
                  <td className="py-2 text-[#1a2a4a]">{taxTypeLabels[type] || type}</td>
                  <td className="py-2 text-right">KES {(values.amount || 0).toLocaleString()}</td>
                  <td className="py-2 text-right font-medium text-[#1a2a4a]">KES {(values.tax || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Method Breakdown */}
      {data.paymentBreakdown && Object.keys(data.paymentBreakdown).length > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-[#1a2a4a] mb-2">Payment Method Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Payment Method</th>
                <th className="pb-2 font-medium text-right">Count</th>
                <th className="pb-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.paymentBreakdown || {}).map(([code, values]) => (
                <tr key={code} className="border-b border-gray-50">
                  <td className="py-2 text-[#1a2a4a]">{paymentMethodLabels[code] || code}</td>
                  <td className="py-2 text-right">{values.count || 0}</td>
                  <td className="py-2 text-right font-medium text-[#1a2a4a]">KES {(values.amount || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center border-t pt-4 mt-4">
        <p>This report shows sales since the last Z report. KRA eTIMS Compliant.</p>
        <p>Generated: {new Date().toLocaleString()}</p>
        <p className="text-[10px] text-gray-500 mt-1">TIN: {import.meta.env.VITE_VSCU_TIN || 'P600003965A'} | Branch: {import.meta.env.VITE_VSCU_BHF_ID || '00'}</p>
      </div>
    </div>
  );
};

export default XReport;