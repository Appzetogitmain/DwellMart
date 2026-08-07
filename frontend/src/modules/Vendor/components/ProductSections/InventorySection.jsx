/**
 * InventorySection — stock quantity + stock status
 */
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";

const InventorySection = ({ formData, handleChange }) => (
  <div>
    <h2 className="text-base font-bold text-gray-800 mb-2">Inventory</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Stock Quantity <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="stockQuantity"
          value={formData.stockQuantity}
          onChange={handleChange}
          required
          min="0"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          placeholder="0"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Stock Status</label>
        <AnimatedSelect
          name="stock"
          value={formData.stock}
          onChange={handleChange}
          options={[
            { value: "in_stock",    label: "In Stock" },
            { value: "low_stock",   label: "Low Stock" },
            { value: "out_of_stock", label: "Out of Stock" },
          ]}
        />
      </div>
    </div>
  </div>
);

export default InventorySection;
