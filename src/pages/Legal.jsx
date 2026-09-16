import kraLogo from '../assets/kra-logo.svg';
import evopayLogo from '../assets/evopay-logo.jpg';

const Legal = () => {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center mb-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <img 
          src={evopayLogo} 
          alt="Evopay" 
          className="h-16 object-contain mb-2"
          onError={(e) => {
            e.target.style.display = 'none';
            const parent = e.target.parentNode;
            const fallback = document.createElement('div');
            fallback.className = 'text-2xl font-bold text-[#f47b20]';
            fallback.textContent = 'Evopay';
            parent.insertBefore(fallback, e.target);
          }}
        />
        <h1 className="text-2xl font-bold text-[#1a2a4a]">Legal & Compliance</h1>
        <p className="text-gray-500 text-sm">Tax compliance and system information</p>
      </div>

      <div className="space-y-6">
        {/* System Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-[#1a2a4a] mb-3">System Information</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium text-gray-600 w-1/3">Application</td>
                <td className="py-2 text-gray-800">Evopay VSCU Cashier System</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium text-gray-600">Version</td>
                <td className="py-2 text-gray-800">
                  <span className="bg-[#f47b20]/10 text-[#f47b20] px-2 py-0.5 rounded text-xs font-bold">
                    v2.0.21
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium text-gray-600">Environment</td>
                <td className="py-2 text-gray-800">
                  <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold">
                    Sandbox
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium text-gray-600">VSCU Status</td>
                <td className="py-2 text-gray-800">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    VSCU connected but not initialized yet
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-2 font-medium text-gray-600">Last Updated</td>
                <td className="py-2 text-gray-800">{new Date().toLocaleDateString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* KRA Compliance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-6 mb-3">
            <img 
              src={kraLogo} 
              alt="KRA" 
              className="h-10 object-contain flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <h2 className="text-lg font-semibold text-[#1a2a4a]">KRA eTIMS Compliance</h2>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            This system is fully compliant with Kenya Revenue Authority (KRA) requirements:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1 pl-4">
            <li>Tax Procedures Act 2015</li>
            <li>VAT Act 2013</li>
            <li>eTIMS VSCU Technical Specifications v2.0</li>
            <li>Real-time invoice signing and KRA transmission</li>
          </ul>
        </div>

        {/* Receipt Types */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-[#1a2a4a] mb-3">KRA Receipt Types</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium">Label</th>
                <th className="pb-2 font-medium">Receipt Type</th>
                <th className="pb-2 font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs font-bold text-[#1a2a4a]">NS</td>
                <td className="py-2">Normal</td>
                <td className="py-2">Sale</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs font-bold text-[#1a2a4a]">NC</td>
                <td className="py-2">Normal</td>
                <td className="py-2">Credit Note</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs font-bold text-[#1a2a4a]">CS</td>
                <td className="py-2">Copy</td>
                <td className="py-2">Sale</td>
              </tr>
              <tr>
                <td className="py-2 font-mono text-xs font-bold text-[#1a2a4a]">PS</td>
                <td className="py-2">Proforma</td>
                <td className="py-2">Sale</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tax Types */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-[#1a2a4a] mb-3">KRA Tax Types</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium">Code</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs font-bold text-blue-600">A</td>
                <td className="py-2">Exempt</td>
                <td className="py-2">0%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs font-bold text-[#f47b20]">B</td>
                <td className="py-2">Standard</td>
                <td className="py-2">16%</td>
              </tr>
              <tr>
                <td className="py-2 font-mono text-xs font-bold text-green-600">C</td>
                <td className="py-2">Zero Rated</td>
                <td className="py-2">0%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-6">
          <p className="font-medium text-gray-500">© {new Date().getFullYear()} Evopay Limited. All rights reserved.</p>
          <p className="mt-1 text-gray-400">This system is for tax compliance purposes only.</p>
        </div>
      </div>
    </div>
  );
};

export default Legal;