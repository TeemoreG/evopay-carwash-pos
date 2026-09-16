import { useRef } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import evopayLogo from '../../assets/evopay-logo.jpg';

const ItemReport = ({ data = [], loading }) => {
  const logoRef = useRef(null);

  const taxTypeLabels = {
    'A': 'Exempt (0%)',
    'B': 'Standard (16%)',
    'C': 'Zero Rated (0%)',
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 flex justify-center">
        <div className="h-6 w-6 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const safeData = data || [];
  const totalQuantity = safeData.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalRevenue = safeData.reduce((sum, item) => sum + (item.total || 0), 0);

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
      doc.text('Item Sales Report (PLU Report)', pageWidth / 2, 28, { align: 'center' });

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
      doc.text('PLU REPORT SUMMARY', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Company: Evopay Limited`, 14, yPos);
      yPos += 5;
      doc.text(`TIN: ${import.meta.env.VITE_VSCU_TIN }`, 14, yPos);
      yPos += 5;
      doc.text(`Branch: ${import.meta.env.VITE_VSCU_BHF_ID }`, 14, yPos);
      yPos += 5;
      doc.text(`Report Type: PLU Report (Item Sales)`, 14, yPos);
      yPos += 5;
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
      yPos += 8;

      // ============================================
      // SUMMARY STATS - KRA Required
      // ============================================
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('SUMMARY STATISTICS', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Total Items Sold: ${totalQuantity}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Revenue: KES ${totalRevenue.toLocaleString()}`, 14, yPos);
      yPos += 5;
      doc.text(`Number of Unique Items: ${safeData.length}`, 14, yPos);
      yPos += 5;
      doc.text(`Average Price per Item: KES ${safeData.length > 0 ? (totalRevenue / totalQuantity).toLocaleString() : '0.00'}`, 14, yPos);
      yPos += 8;

      // ============================================
      // ITEM TABLE - KRA Required (PLU Report)
      // ============================================
      if (safeData.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(150, 150, 150);
        doc.text('No data available', pageWidth / 2, 100, { align: 'center' });
        doc.save('item-sales-report.pdf');
        return;
      }

      const tableData = safeData.map(item => [
        item.itemCd || item.code || 'N/A',
        item.name || 'N/A',
        item.itemClsCd || item.class || 'N/A',
        taxTypeLabels[item.taxTyCd || item.taxType || 'B'] || 'B',
        String(item.quantity || 0),
        `KES ${(item.price || 0).toLocaleString()}`,
        `KES ${(item.total || 0).toLocaleString()}`,
        String(item.currentStock || 0)  // KRA requires remaining stock
      ]);

      doc.autoTable({
        startY: yPos + 5,
        head: [['Code', 'Name', 'KRA Class', 'Tax', 'Qty Sold', 'Unit Price', 'Total Revenue', 'Remaining Stock']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        foot: [[
          { content: 'TOTAL', styles: { fontStyle: 'bold' } },
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: String(totalQuantity), styles: { fontStyle: 'bold' } },
          { content: '', styles: {} },
          { content: `KES ${totalRevenue.toLocaleString()}`, styles: { fontStyle: 'bold', textColor: accentColor } },
          { content: '', styles: {} }
        ]],
        footStyles: {
          fillColor: [245, 245, 245],
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 50 },
          2: { cellWidth: 30 },
          3: { cellWidth: 20 },
          4: { cellWidth: 15, halign: 'right' },
          5: { cellWidth: 25, halign: 'right' },
          6: { cellWidth: 30, halign: 'right' },
          7: { cellWidth: 25, halign: 'right' },
        },
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, finalY, pageWidth, 25, 'F');

      doc.setFontSize(7);
      doc.setTextColor(200, 200, 200);
      doc.text('This PLU Report is KRA eTIMS compliant.', pageWidth / 2, finalY + 8, { align: 'center' });
      doc.text('This report shows item-level sales with remaining stock quantities.', pageWidth / 2, finalY + 14, { align: 'center' });
      doc.text('© Evopay Limited. All rights reserved.', pageWidth / 2, finalY + 20, { align: 'center' });

      doc.save('item-sales-report.pdf');
    } catch (error) {
      console.error('PDF Download Error:', error);
      alert('Error downloading PDF: ' + error.message);
    }
  };

  const exportCSV = () => {
    try {
      if (safeData.length === 0) {
        alert('No data to export.');
        return;
      }

      const lines = [];

      lines.push('"Evopay VSCU Cashier System"');
      lines.push('"Item Sales Report (PLU Report)"');
      lines.push(`"Generated: ${new Date().toLocaleString()}"`);
      lines.push(`"TIN: ${import.meta.env.VITE_VSCU_TIN || 'P600003965A'}"`);
      lines.push('"KRA eTIMS Compliant"');
      lines.push('');

      lines.push('"=== PLU REPORT SUMMARY ==="');
      lines.push(`"Total Items Sold","${totalQuantity}"`);
      lines.push(`"Total Revenue","KES ${totalRevenue.toLocaleString()}"`);
      lines.push(`"Number of Unique Items","${safeData.length}"`);
      lines.push(`"Average Price per Item","KES ${safeData.length > 0 ? (totalRevenue / totalQuantity).toLocaleString() : '0.00'}"`);
      lines.push('');

      lines.push('"=== ITEM SALES DETAILS ==="');
      lines.push('"Item Code,Item Name,KRA Class,Tax Type,Quantity Sold,Unit Price (KES),Total Revenue (KES),Remaining Stock"');

      safeData.forEach(item => {
        const row = [
          `"${item.itemCd || item.code || 'N/A'}"`,
          `"${item.name || 'N/A'}"`,
          `"${item.itemClsCd || item.class || 'N/A'}"`,
          `"${taxTypeLabels[item.taxTyCd || item.taxType || 'B'] || 'B'}"`,
          item.quantity || 0,
          (item.price || 0).toFixed(2),
          (item.total || 0).toFixed(2),
          item.currentStock || 0
        ];
        lines.push(row.join(','));
      });

      lines.push('');
      lines.push(`"TOTAL",,,,${totalQuantity},,${totalRevenue.toFixed(2)},`);
      lines.push('');
      lines.push(`"Generated: ${new Date().toLocaleString()}"`);
      lines.push('"Evopay Limited | KRA eTIMS Compliant VSCU v2.0.21"');

      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `item-sales-report_${new Date().toISOString().split('T')[0]}.csv`;
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
        <h2 className="text-lg font-semibold text-[#1a2a4a]">Item Sales Report (PLU Report)</h2>
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
          <p className="text-xs text-gray-500">Items Sold</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{totalQuantity}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Revenue</p>
          <p className="text-xl font-bold text-[#1a2a4a]">KES {totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Unique Items</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{safeData.length}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Avg Price</p>
          <p className="text-xl font-bold text-[#1a2a4a]">KES {safeData.length > 0 ? (totalRevenue / totalQuantity).toLocaleString() : '0.00'}</p>
        </div>
      </div>

      {safeData.length === 0 ? (
        <p className="text-center text-gray-400 py-4">No items sold yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Code</th>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">KRA Class</th>
                <th className="pb-2 font-medium">Tax</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Price</th>
                <th className="pb-2 font-medium text-right">Revenue</th>
                <th className="pb-2 font-medium text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {safeData.map((item, index) => (
                <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-600 font-mono">{item.itemCd || item.code || 'N/A'}</td>
                  <td className="py-2 font-medium text-[#1a2a4a]">{item.name || 'N/A'}</td>
                  <td className="py-2 text-gray-600">{item.itemClsCd || item.class || 'N/A'}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.taxTyCd === 'A' ? 'bg-blue-50 text-blue-600' :
                      item.taxTyCd === 'B' ? 'bg-orange-50 text-orange-600' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      {item.taxTyCd || item.taxType || 'B'}
                    </span>
                  </td>
                  <td className="py-2 text-right text-[#1a2a4a]">{item.quantity || 0}</td>
                  <td className="py-2 text-right text-[#1a2a4a]">KES {(item.price || 0).toLocaleString()}</td>
                  <td className="py-2 text-right font-medium text-[#1a2a4a]">KES {(item.total || 0).toLocaleString()}</td>
                  <td className="py-2 text-right text-[#1a2a4a]">{item.currentStock || 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-bold border-t-2">
              <tr>
                <td className="py-2 text-right text-[#1a2a4a]" colSpan="4">TOTAL</td>
                <td className="py-2 text-right text-[#1a2a4a]">{totalQuantity}</td>
                <td className="py-2 text-right"></td>
                <td className="py-2 text-right text-[#f47b20]">KES {totalRevenue.toLocaleString()}</td>
                <td className="py-2 text-right"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center border-t pt-4 mt-4">
        <p>This report shows item-level sales with remaining stock quantities. KRA eTIMS Compliant.</p>
        <p>Generated: {new Date().toLocaleString()}</p>
        <p className="text-[10px] text-gray-500 mt-1">TIN: {import.meta.env.VITE_VSCU_TIN || 'P600003965A'} | Branch: {import.meta.env.VITE_VSCU_BHF_ID || '00'}</p>
      </div>
    </div>
  );
};

export default ItemReport;