/**
 * PricingSection — price, original price, tax bracket, tax calculation
 */
const PricingSection = ({ formData, handleChange, setFormData, taxRules }) => (
  <div>
    <h2 className="text-base font-bold text-gray-800 mb-2">Pricing</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Price <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          required
          min="0"
          step="0.01"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Original Price (for discount)
        </label>
        <input
          type="number"
          name="originalPrice"
          value={formData.originalPrice}
          onChange={handleChange}
          min="0"
          step="0.01"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Tax Bracket <span className="text-red-500">*</span>
        </label>
        <select
          name="taxRate"
          value={formData.taxRate}
          onChange={handleChange}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {taxRules.map((rule) => (
            <option key={rule.id} value={rule.rate}>
              {rule.name} ({rule.rate}%)
            </option>
          ))}
          {taxRules.length === 0 && (
            <option value="18">Standard Tax (18%)</option>
          )}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Tax Calculation <span className="text-red-500">*</span>
        </label>
        <select
          name="taxIncluded"
          value={formData.taxIncluded}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, taxIncluded: e.target.value === "true" }))
          }
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="false">Tax Excluded (Net Price)</option>
          <option value="true">Tax Included (Gross Price)</option>
        </select>
      </div>
    </div>
  </div>
);

export default PricingSection;
