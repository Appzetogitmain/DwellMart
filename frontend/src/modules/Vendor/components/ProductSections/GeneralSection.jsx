/**
 * GeneralSection — Product name, unit, category, brand, description
 */
import CategorySelector from "../../../Admin/components/CategorySelector";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";

const GeneralSection = ({ formData, handleChange, brands }) => (
  <div>
    <h2 className="text-base font-bold text-gray-800 mb-2">Basic Information</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Product Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          placeholder="Enter product name"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Unit</label>
        <input
          type="text"
          name="unit"
          value={formData.unit}
          onChange={handleChange}
          placeholder="e.g., Piece, Kilogram, Gram, Pair"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Category <span className="text-red-500">*</span>
        </label>
        <CategorySelector
          value={formData.categoryId}
          subcategoryId={formData.subcategoryId}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Brand</label>
        <AnimatedSelect
          name="brandId"
          value={formData.brandId || ""}
          onChange={handleChange}
          placeholder="Select Brand"
          options={[
            { value: "", label: "Select Brand" },
            ...brands
              .filter((b) => b.isActive !== false)
              .map((b) => ({ value: String(b.id), label: b.name })),
          ]}
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          placeholder="Enter product description..."
        />
      </div>
    </div>
  </div>
);

export default GeneralSection;
