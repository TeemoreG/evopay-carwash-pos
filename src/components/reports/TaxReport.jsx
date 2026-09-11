import { useRef } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import evopayLogo from '../../assets/evopay-logo.png';

const TaxReport = ({ data, loading }) => {
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

  const totalAmount = data.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  const totalTax = data.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
  const totalTransactions = data.reduce((sum, item) => sum + (item.count || 0), 0);

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
      doc.text('Tax Report', pageWidth / 2, 28, { align: 'center' });

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
      doc.text('TAX REPORT SUMMARY', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Company: Evopay Limited`, 14, yPos);
      yPos += 5;
      doc.text(`TIN: ${import.meta.env.VITE_VSCU_TIN }`, 14, yPos);
      yPos += 5;
      doc.text(`Branch: ${import.meta.env.VITE_VSCU_BHF_ID}`, 14, yPos);
      yPos += 5;
      doc.text(`Report Type: Tax Report`, 14, yPos);
      yPos += 5;
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
      yPos += 8;

      // ============================================
      // SUMMARY STATISTICS - KRA Required
      // ============================================
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('SUMMARY STATISTICS', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Total Transactions: ${totalTransactions}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Sales Amount: KES ${totalAmount.toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Tax Collected: KES ${totalTax.toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Effective Tax Rate: ${totalAmount > 0 ? ((totalTax / totalAmount) * 100).toFixed(2) : '0.00'}%`, 14, yPos);
      yPos += 8;

      // ============================================
      // TAX TYPE BREAKDOWN - KRA Required
      // ============================================
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('TAX TYPE BREAKDOWN', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Tax Type`, 14, yPos);
      doc.text(`Transactions`, 60, yPos);
      doc.text(`Amount (KES)`, 90, yPos);
      doc.text(`Tax (KES)`, 120, yPos);
      yPos += 4;
      doc.line(14, yPos, 150, yPos);
      yPos += 4;
      
      data.forEach(item => {
        doc.text(`${taxTypeLabels[item.type] || item.type}`, 14, yPos);
        doc.text(`${item.count || 0}`, 60, yPos);
        doc.text(`${(item.totalAmount || 0).toLocaleString()}`, 90, yPos);
        doc.text(`${(item.taxAmount || 0).toLocaleString()}`, 120, yPos);
        yPos += 5;
      });
      
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL`, 14, yPos);
      doc.text(`${totalTransactions}`, 60, yPos);
      doc.text(`${totalAmount.toLocaleString()}`, 90, yPos);
      doc.text(`${totalTax.toLocaleString()}`, 120, yPos);
      yPos += 8;

      // ============================================
      // PAYMENT METHOD BREAKDOWN - KRA Required
      // ============================================
      if (data.some(item => item.paymentBreakdown)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('PAYMENT METHOD BREAKDOWN', 14, yPos);
        yPos += 6;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Payment Method`, 14, yPos);
        doc.text(`Transactions`, 60, yPos);
        doc.text(`Amount (KES)`, 90, yPos);
        yPos += 4;
        doc.line(14, yPos, 130, yPos);
        yPos += 4;
        
        // Aggregate payment methods across tax types
        const paymentAggregate = {};
        data.forEach(item => {
          if (item.paymentBreakdown) {
            Object.entries(item.paymentBreakdown).forEach(([code, values]) => {
              if (!paymentAggregate[code]) {
                paymentAggregate[code] = { count: 0, amount: 0 };
              }
              paymentAggregate[code].count += values.count || 0;
              paymentAggregate[code].amount += values.amount || 0;
            });
          }
        });
        
        Object.entries(paymentAggregate).forEach(([code, values]) => {
          doc.text(`${paymentMethodLabels[code] || code}`, 14, yPos);
          doc.text(`${values.count || 0}`, 60, yPos);
          doc.text(`${(values.amount || 0).toLocaleString()}`, 90, yPos);
          yPos += 5;
        });
        yPos += 8;
      }

      // ============================================
      // PRODUCT TAX DETAILS
      // ============================================
      let allProducts = [];
      data.forEach(item => {
        if (item.products && Array.isArray(item.products)) {
          item.products.forEach(product => {
            allProducts.push({
              name: product.name || 'Unknown',
              itemCd: product.itemCd || product.code || 'N/A',
              taxType: product.taxType || item.type || 'B',
              amount: product.amount || 0,
              taxAmount: product.taxAmount || 0,
            });
          });
        }
      });

      if (allProducts.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('PRODUCT TAX DETAILS', 14, yPos);
        yPos += 6;

        const productTableData = allProducts.map(p => [
          p.itemCd,
          p.name,
          taxTypeLabels[p.taxType] || p.taxType,
          `KES ${p.amount.toLocaleString()}`,
          `KES ${p.taxAmount.toLocaleString()}`
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Item Code', 'Product', 'Tax Type', 'Amount', 'Tax']],
          body: productTableData.slice(0, 20), // Limit to 20 items for PDF
          theme: 'striped',
          headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
          },
          foot: [[
            { content: 'TOTAL', styles: { fontStyle: 'bold' } },
            { content: '', styles: {} },
            { content: '', styles: {} },
            { content: `KES ${totalAmount.toLocaleString()}`, styles: { fontStyle: 'bold' } },
            { content: `KES ${totalTax.toLocaleString()}`, styles: { fontStyle: 'bold', textColor: accentColor } }
          ]],
          footStyles: {
            fillColor: [245, 245, 245],
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251],
          },
        });

        yPos = doc.lastAutoTable.finalY + 10;
      }

      // ============================================
      // FOOTER - KRA Required
      // ============================================
      const finalY = yPos + 10;
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, finalY, pageWidth, 25, 'F');
      doc.setFontSize(7);
      doc.setTextColor(200, 200, 200);
      doc.text('This Tax Report is KRA eTIMS compliant.', pageWidth / 2, finalY + 8, { align: 'center' });
      doc.text('All tax amounts are calculated based on KRA eTIMS tax rates.', pageWidth / 2, finalY + 14, { align: 'center' });
      doc.text('© Evopay Limited. All rights reserved.', pageWidth / 2, finalY + 20, { align: 'center' });

      doc.save('tax-report.pdf');
    } catch (error) {
      console.error('PDF Download Error:', error);
      alert('Error downloading PDF: ' + error.message);
    }
  };

  const exportCSV = () => {
    try {
      if (data.length === 0) {
        alert('No data to export.');
        return;
      }

      const lines = [];

      lines.push('"Evopay VSCU Cashier System"');
      lines.push('"Tax Report"');
      lines.push(`"Generated: ${new Date().toLocaleString()}"`);
      lines.push(`"TIN: ${import.meta.env.VITE_VSCU_TIN }"`);
      lines.push('"KRA eTIMS Compliant"');
      lines.push('');

      lines.push('"=== TAX TYPE BREAKDOWN ==="');
      lines.push('"Tax Type","Transactions","Total Amount (KES)","Tax Collected (KES)"');
      data.forEach(item => {
        lines.push(`"${taxTypeLabels[item.type] || item.type}",${item.count || 0},${(item.totalAmount || 0).toFixed(2)},${(item.taxAmount || 0).toFixed(2)}`);
      });
      lines.push(`"TOTAL",${totalTransactions},${totalAmount.toFixed(2)},${totalTax.toFixed(2)}`);
      lines.push('');

      // Payment method breakdown
      const paymentAggregate = {};
      data.forEach(item => {
        if (item.paymentBreakdown) {
          Object.entries(item.paymentBreakdown).forEach(([code, values]) => {
            if (!paymentAggregate[code]) {
              paymentAggregate[code] = { count: 0, amount: 0 };
            }
            paymentAggregate[code].count += values.count || 0;
            paymentAggregate[code].amount += values.amount || 0;
          });
        }
      });

      if (Object.keys(paymentAggregate).length > 0) {
        lines.push('"=== PAYMENT METHOD BREAKDOWN ==="');
        lines.push('"Payment Method","Transactions","Amount (KES)"');
        Object.entries(paymentAggregate).forEach(([code, values]) => {
          lines.push(`"${paymentMethodLabels[code] || code}",${values.count || 0},${(values.amount || 0).toFixed(2)}`);
        });
        lines.push('');
      }

      // Product tax details
      let allProducts = [];
      data.forEach(item => {
        if (item.products && Array.isArray(item.products)) {
          item.products.forEach(product => {
            allProducts.push({
              name: product.name || 'Unknown',
              itemCd: product.itemCd || product.code || 'N/A',
              taxType: product.taxType || item.type || 'B',
              amount: product.amount || 0,
              taxAmount: product.taxAmount || 0,
            });
          });
        }
      });

      if (allProducts.length > 0) {
        lines.push('"=== PRODUCT TAX DETAILS ==="');
        lines.push('"Item Code","Product","Tax Type","Amount (KES)","Tax (KES)"');
        allProducts.forEach(p => {
          lines.push(`"${p.itemCd}","${p.name}","${taxTypeLabels[p.taxType] || p.taxType}",${p.amount.toFixed(2)},${p.taxAmount.toFixed(2)}`);
        });
        lines.push('');
      }

      lines.push(`"Effective Tax Rate",,,"${totalAmount > 0 ? ((totalTax / totalAmount) * 100).toFixed(2) : '0.00'}%"`);
      lines.push('');
      lines.push(`"Generated: ${new Date().toLocaleString()}"`);
      lines.push('"Evopay Limited | KRA eTIMS Compliant VSCU v2.0.21"');

      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-report_${new Date().toISOString().split('T')[0]}.csv`;
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
        <h2 className="text-lg font-semibold text-[#1a2a4a]">Tax Report</h2>
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Transactions</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{totalTransactions}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Total Sales</p>
          <p className="text-xl font-bold text-[#1a2a4a]">KES {totalAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Total Tax</p>
          <p className="text-xl font-bold text-[#1a2a4a]">KES {totalTax.toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Effective Rate</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{totalAmount > 0 ? ((totalTax / totalAmount) * 100).toFixed(2) : '0.00'}%</p>
        </div>
      </div>

      {/* Tax Type Summary */}
      <div className="border-t pt-4 mb-4">
        <h3 className="text-sm font-semibold text-[#1a2a4a] mb-2">Tax Type Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {data.map((item, index) => (
            <div key={index} className="bg-white p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">{taxTypeLabels[item.type] || item.type}</p>
              <p className="text-lg font-bold text-[#1a2a4a]">KES {item.taxAmount.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{item.count || 0} transactions</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Type Table */}
      <div className="border-t pt-4 mb-4">
        <h3 className="text-sm font-semibold text-[#1a2a4a] mb-2">Tax Type Breakdown</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 font-medium">Tax Type</th>
              <th className="pb-2 font-medium text-right">Transactions</th>
              <th className="pb-2 font-medium text-right">Amount (KES)</th>
              <th className="pb-2 font-medium text-right">Tax (KES)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 text-[#1a2a4a]">{taxTypeLabels[item.type] || item.type}</td>
                <td className="py-2 text-right">{item.count || 0}</td>
                <td className="py-2 text-right">KES {(item.totalAmount || 0).toLocaleString()}</td>
                <td className="py-2 text-right font-medium text-[#1a2a4a]">KES {(item.taxAmount || 0).toLocaleString()}</td>
              </tr>
            ))}
            <tr className="font-bold border-t-2">
              <td className="py-2 text-[#1a2a4a]">TOTAL</td>
              <td className="py-2 text-right">{totalTransactions}</td>
              <td className="py-2 text-right">KES {totalAmount.toLocaleString()}</td>
              <td className="py-2 text-right text-[#f47b20]">KES {totalTax.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Product Tax Details */}
      {data.some(item => item.products && item.products.length > 0) && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-[#1a2a4a] mb-2">Product Tax Details</h3>
          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Code</th>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Tax Type</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 font-medium text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => (
                  item.products && item.products.map((product, pIdx) => (
                    <tr key={`${index}-${pIdx}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-600 font-mono">{product.itemCd || product.code || 'N/A'}</td>
                      <td className="py-2 font-medium text-[#1a2a4a]">{product.name}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          product.taxType === 'A' ? 'bg-blue-50 text-blue-600' :
                          product.taxType === 'B' ? 'bg-orange-50 text-orange-600' :
                          'bg-gray-50 text-gray-600'
                        }`}>
                          {product.taxType || 'B'}
                        </span>
                      </td>
                      <td className="py-2 text-right">KES {product.amount.toLocaleString()}</td>
                      <td className="py-2 text-right text-[#1a2a4a]">KES {product.taxAmount.toLocaleString()}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center border-t pt-4 mt-4">
        <p>This Tax Report is KRA eTIMS compliant.</p>
        <p>Generated: {new Date().toLocaleString()}</p>
        <p className="text-[10px] text-gray-500 mt-1">TIN: {import.meta.env.VITE_VSCU_TIN } | Branch: {import.meta.env.VITE_VSCU_BHF_ID || '00'}</p>
      </div>
    </div>
  );
};

export default TaxReport;