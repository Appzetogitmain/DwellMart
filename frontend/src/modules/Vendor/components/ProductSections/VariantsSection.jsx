/**
 * VariantsSection — sizes, colors, dynamic attributes, variant price/stock/image map
 */
import { FiX } from "react-icons/fi";

const VariantsSection = ({
  formData,
  setFormData,
  variantAxisInput,
  setVariantAxisInput,
  variantCombinations,
  handleVariantAxisInputKeyDown,
  addVariantAxisValues,
  removeVariantAxisValue,
  addAttributeRow,
  removeAttributeRow,
  updateAttributeName,
  updateAttributeValues,
  handleVariantImageUpload,
  isUploadingMedia,
}) => (
  <div>
    <h2 className="text-base font-bold text-gray-800 mb-2">Product Variants</h2>
    <div className="space-y-3">
      {/* Sizes */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Sizes</label>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(formData.variants?.sizes || []).map((size) => (
              <span
                key={size}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200"
              >
                {size}
                <button
                  type="button"
                  onClick={() => removeVariantAxisValue("sizes", size)}
                  className="text-blue-700 hover:text-blue-900"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={variantAxisInput.sizes}
              onChange={(e) => setVariantAxisInput((prev) => ({ ...prev, sizes: e.target.value }))}
              onKeyDown={(e) => handleVariantAxisInputKeyDown("sizes", e)}
              onBlur={() => addVariantAxisValues("sizes", variantAxisInput.sizes)}
              placeholder="Type size and press Enter (e.g. S, M, L)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            <button
              type="button"
              onClick={() => addVariantAxisValues("sizes", variantAxisInput.sizes)}
              className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Colors */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Colors</label>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(formData.variants?.colors || []).map((color) => (
              <span
                key={color}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs border border-emerald-200"
              >
                {color}
                <button
                  type="button"
                  onClick={() => removeVariantAxisValue("colors", color)}
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={variantAxisInput.colors}
              onChange={(e) => setVariantAxisInput((prev) => ({ ...prev, colors: e.target.value }))}
              onKeyDown={(e) => handleVariantAxisInputKeyDown("colors", e)}
              onBlur={() => addVariantAxisValues("colors", variantAxisInput.colors)}
              placeholder="Type color and press Enter (e.g. Red, Blue)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            <button
              type="button"
              onClick={() => addVariantAxisValues("colors", variantAxisInput.colors)}
              className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Attributes */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-gray-700">
            Dynamic Attributes (optional)
          </label>
          <button
            type="button"
            onClick={addAttributeRow}
            className="px-2 py-1 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Add Attribute
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          Example: RAM {"->"} 8GB, 16GB | Storage {"->"} 128GB, 256GB
        </p>
        <div className="space-y-2">
          {(formData.variants?.attributes || []).map((attribute, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <input
                type="text"
                value={attribute?.name || ""}
                onChange={(e) => updateAttributeName(index, e.target.value)}
                placeholder="Attribute name"
                className="md:col-span-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <input
                type="text"
                value={(attribute?.values || []).join(", ")}
                onChange={(e) => updateAttributeValues(index, e.target.value)}
                placeholder="Values (comma separated)"
                className="md:col-span-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <button
                type="button"
                onClick={() => removeAttributeRow(index)}
                className="md:col-span-1 px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                aria-label="Remove attribute"
              >
                <FiX className="w-4 h-4 mx-auto" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Variant Prices + Stock + Images */}
      {variantCombinations.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 mb-2">Variant Prices & Stock</p>
          <div className="space-y-2">
            {variantCombinations.map((combo) => (
              <div key={combo.key} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                <p className="text-xs text-gray-700 md:col-span-1">
                  {combo.label || `${combo.size || "Any"} / ${combo.color || "Any"}`}
                </p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.variants?.prices?.[combo.key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      variants: {
                        ...prev.variants,
                        prices: {
                          ...(prev.variants?.prices || {}),
                          [combo.key]: v === "" ? "" : Number(v),
                        },
                      },
                    }));
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  placeholder="Use base price"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.variants?.stockMap?.[combo.key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      variants: {
                        ...prev.variants,
                        stockMap: {
                          ...(prev.variants?.stockMap || {}),
                          [combo.key]: v === "" ? "" : Number(v),
                        },
                      },
                    }));
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  placeholder="Variant stock"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    id={`variant-image-${combo.key}`}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVariantImageUpload(combo.key, file);
                      e.target.value = "";
                    }}
                    disabled={isUploadingMedia}
                  />
                  <label
                    htmlFor={`variant-image-${combo.key}`}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs cursor-pointer hover:bg-gray-100"
                  >
                    Upload
                  </label>
                  {formData.variants?.imageMap?.[combo.key] && (
                    <img
                      src={formData.variants.imageMap[combo.key]}
                      alt="Variant"
                      className="w-8 h-8 rounded object-cover border border-gray-300"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Default Variant */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <select
              value={formData.variants?.defaultVariant?.size || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  variants: {
                    ...prev.variants,
                    defaultVariant: {
                      ...(prev.variants?.defaultVariant || {}),
                      size: e.target.value,
                    },
                  },
                }))
              }
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
            >
              <option value="">Default size (optional)</option>
              {(formData.variants?.sizes || []).map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <select
              value={formData.variants?.defaultVariant?.color || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  variants: {
                    ...prev.variants,
                    defaultVariant: {
                      ...(prev.variants?.defaultVariant || {}),
                      color: e.target.value,
                    },
                  },
                }))
              }
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
            >
              <option value="">Default color (optional)</option>
              {(formData.variants?.colors || []).map((color) => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  </div>
);

export default VariantsSection;
