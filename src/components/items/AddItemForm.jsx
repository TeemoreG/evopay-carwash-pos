import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const SERVICE_CATEGORIES = [
  { id: 'basic', name: 'Basic Wash' },
  { id: 'standard', name: 'Standard Wash' },
  { id: 'premium', name: 'Premium Wash' },
  { id: 'vip', name: 'VIP Wash' },
  { id: 'interior', name: 'Interior' },
  { id: 'addon', name: 'Add-ons' },
];

const PRODUCT_CATEGORIES = [
  { id: 'detergent', name: 'Detergents' },
  { id: 'freshener', name: 'Air Fresheners' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'polish', name: 'Polishes & Wax' },
  { id: 'consumable', name: 'Consumables' },
  { id: 'other', name: 'Other' },
];

const SERVICE_PRESETS = [800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000];
const PRODUCT_PRESETS = [50, 100, 150, 200, 250, 300, 500, 800, 1000];

// Build a Cloudinary thumbnail URL (200x200 square crop).
// Works with any Cloudinary URL; falls back to the original if not Cloudinary.
const toThumb = (url) => {
  if (!url) return '';
  if (!url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/w_200,h_200,c_fill/');
};

const AddItemForm = ({ item, onSave, onCancel, isSaving, mode = 'service' }) => {
  const { user } = useAuth();
  const isEditing = !!item;
  const isProduct = mode === 'product';

  const [formData, setFormData] = useState({
    itemCd: '',
    itemNm: '',
    itemStdNm: '',
    itemClsCd: '',
    itemTyCd: isProduct ? '1' : '2',
    dftPrc: '',
    taxTyCd: 'B',
    sftyQty: '',
    stock: '',
    orgnNatCd: 'KE',
    pkgUnitCd: 'NT',
    qtyUnitCd: 'U',
    useYn: 'Y',
    isrcAplcbYn: 'N',
    bcd: '',
    addInfo: '',
    category: isProduct ? 'detergent' : 'basic',
    image_url: '',
  });

  useEffect(() => {
    if (item) {
      const itemIsProduct = (item.item_type === 'product') || (item.itemTyCd === '1');
      setFormData({
        itemCd: item.itemCd || item.item_cd || '',
        itemNm: item.itemNm || item.item_name || '',
        itemStdNm: item.itemStdNm || '',
        itemClsCd: item.itemClsCd || item.item_cls_cd || '5059690809',
        itemTyCd: item.itemTyCd || (itemIsProduct ? '1' : '2'),
        dftPrc: item.dftPrc || item.price || '',
        taxTyCd: item.taxTyCd || item.tax_type || 'B',
        sftyQty: item.sftyQty || item.sfty_qty || '',
        stock: item.stock ?? '',
        orgnNatCd: item.orgnNatCd || item.orgn_nat_cd || 'KE',
        pkgUnitCd: item.pkgUnitCd || item.pkg_unit_cd || 'NT',
        qtyUnitCd: item.qtyUnitCd || item.qty_unit_cd || 'U',
        useYn: item.useYn || item.use_yn || 'Y',
        isrcAplcbYn: item.isrcAplcbYn || item.isrc_aplcb_yn || 'N',
        bcd: item.bcd || '',
        addInfo: item.addInfo || item.add_info || '',
        category: item.category || (itemIsProduct ? 'detergent' : 'basic'),
        image_url: item.image_url || '',
      });
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.itemCd || !formData.itemNm || !formData.dftPrc || !formData.itemClsCd) {
      alert('Please fill in: Code, Name, Price, and KRA Class Code');
      return;
    }
    if (parseFloat(formData.dftPrc) < 0) {
      alert('Price must be greater than or equal to 0');
      return;
    }

    const payload = {
      tin: user?.tin || '',
      bhfId: user?.bhfId || '00',
      itemCd: formData.itemCd,
      itemNm: formData.itemNm,
      itemStdNm: formData.itemStdNm || null,
      itemClsCd: formData.itemClsCd,
      itemTyCd: formData.itemTyCd || (isProduct ? '1' : '2'),
      orgnNatCd: formData.orgnNatCd,
      pkgUnitCd: formData.pkgUnitCd,
      qtyUnitCd: formData.qtyUnitCd,
      taxTyCd: formData.taxTyCd,
      btchNo: null,
      bcd: formData.bcd || null,
      dftPrc: parseFloat(formData.dftPrc) || 0,
      grpPrcL1: parseFloat(formData.dftPrc) || 0,
      grpPrcL2: parseFloat(formData.dftPrc) || 0,
      grpPrcL3: parseFloat(formData.dftPrc) || 0,
      grpPrcL4: parseFloat(formData.dftPrc) || 0,
      grpPrcL5: null,
      addInfo: formData.addInfo || null,
      sftyQty: parseInt(formData.sftyQty) || 0,
      isrcAplcbYn: formData.isrcAplcbYn || 'N',
      useYn: formData.useYn || 'Y',
      regrNm: user?.full_name || user?.username || 'Admin',
      regrId: user?.username || 'Admin',
      modrNm: user?.full_name || user?.username || 'Admin',
      modrId: user?.username || 'Admin',
      item_type: isProduct ? 'product' : 'service',
      category: formData.category,
      stock: isProduct ? (parseInt(formData.stock) || 0) : 0,
      image_url: formData.image_url.trim() || null,
    };

    onSave(payload);
  };

  const categories = isProduct ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES;
  const pricePresets = isProduct ? PRODUCT_PRESETS : SERVICE_PRESETS;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1a2a4a]">
            {isEditing
              ? `Edit ${isProduct ? 'Product' : 'Service'}`
              : `Add New ${isProduct ? 'Product' : 'Service'}`}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {isProduct
              ? 'Retail item with stock tracking'
              : 'Car wash service with KRA eTIMS sync'}
          </p>
        </div>
        {isEditing && (
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full font-mono">
            {formData.itemCd}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isProduct ? 'Product' : 'Service'} Code {!isEditing && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            name="itemCd"
            value={formData.itemCd}
            onChange={handleChange}
            disabled={isEditing}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm font-mono ${
              isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
            }`}
            placeholder={isProduct ? 'e.g. PRD001' : 'e.g. SRV001'}
            required={!isEditing}
          />
          {isEditing && <p className="text-xs text-gray-400 mt-1">Code cannot be changed</p>}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isProduct ? 'Product' : 'Service'} Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="itemNm"
            value={formData.itemNm}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
            placeholder={isProduct ? 'e.g. Air Freshener' : 'e.g. Standard Wash'}
            required
          />
        </div>

        {/* Image URL + Preview */}
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <div className="flex gap-3 items-start">
            <input
              type="url"
              name="image_url"
              value={formData.image_url}
              onChange={handleChange}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm font-mono"
              placeholder="https://res.cloudinary.com/dvqjgbdhp/image/upload/..."
            />
            <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
              {formData.image_url ? (
                <img
                  src={toThumb(formData.image_url)}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = '<span class="text-[10px] text-gray-400 text-center px-1">Invalid URL</span>';
                  }}
                />
              ) : (
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Paste a Cloudinary URL. It will be auto-cropped to a square thumbnail for the POS grid.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price (KES) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="dftPrc"
            value={formData.dftPrc}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm font-bold text-[#f47b20]"
            placeholder={isProduct ? 'e.g. 200' : 'e.g. 800'}
            required
            min="0"
            step="0.01"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {pricePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFormData({ ...formData, dftPrc: preset })}
                className={`px-2.5 py-1 text-xs rounded-lg border transition ${
                  Number(formData.dftPrc) === preset
                    ? 'bg-[#f47b20] text-white border-[#f47b20]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#f47b20]'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {isProduct ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
            <input
              type="number"
              name="stock"
              value={formData.stock}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
              placeholder="e.g. 50"
              min="0"
            />
            <p className="text-xs text-gray-400 mt-1">Current stock on hand</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              name="sftyQty"
              value={formData.sftyQty}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
              placeholder="e.g. 30"
              min="0"
            />
            <p className="text-xs text-gray-400 mt-1">Estimated wash time</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            KRA Class Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="itemClsCd"
            value={formData.itemClsCd}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm font-mono"
            placeholder="e.g. 5059690809"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
          <select
            name="taxTyCd"
            value={formData.taxTyCd}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
          >
            <option value="A">A - Exempt (0%)</option>
            <option value="B">B - Standard (16%)</option>
            <option value="C">C - Zero Rated (0%)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            name="useYn"
            value={formData.useYn}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
          >
            <option value="Y">Active</option>
            <option value="N">Inactive</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
          <input
            type="text"
            name="bcd"
            value={formData.bcd}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm font-mono"
            placeholder="Optional"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            name="addInfo"
            value={formData.addInfo}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent text-sm"
            placeholder={isProduct ? 'e.g. 250ml can' : 'e.g. Exterior wash + vacuum'}
          />
        </div>

        <input type="hidden" name="itemTyCd" value={formData.itemTyCd} />
        <input type="hidden" name="orgnNatCd" value={formData.orgnNatCd} />
        <input type="hidden" name="pkgUnitCd" value={formData.pkgUnitCd} />
        <input type="hidden" name="qtyUnitCd" value={formData.qtyUnitCd} />
        <input type="hidden" name="isrcAplcbYn" value={formData.isrcAplcbYn} />

        <div className="flex items-center gap-3 md:col-span-3 pt-4 border-t border-gray-100">
          <button
            type="submit"
            disabled={isSaving}
            className={`bg-[#f47b20] hover:bg-[#e06d1a] text-white px-6 py-2.5 rounded-lg transition font-medium text-sm flex items-center gap-2 ${
              isSaving ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
                {isEditing ? 'Updating...' : 'Saving...'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                {isEditing ? `Update ${isProduct ? 'Product' : 'Service'}` : `Save ${isProduct ? 'Product' : 'Service'}`}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="border border-gray-300 hover:bg-gray-50 px-5 py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddItemForm;