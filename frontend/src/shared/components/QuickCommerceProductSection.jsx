import { FiZap } from "react-icons/fi";

/**
 * Quick Commerce product configuration.
 *
 * Shared by the Vendor Add/Edit product forms and the Admin product form so the
 * channel toggle, category picker, and QC attributes are defined exactly once.
 *
 * Fully controlled — the parent owns state and passes `value` + `onChange`.
 *
 * @param {object}   value              { quickCommerceEnabled, quickCommerceCategoryId, quickCommerce }
 * @param {function} onChange           Receives the next value object.
 * @param {Array}    categories         Quick Commerce category tree (flat list).
 * @param {boolean}  vendorQuickCommerceEnabled  Whether the owning vendor has the channel.
 * @param {boolean}  disabled
 */
const QuickCommerceProductSection = ({
  value,
  onChange,
  categories = [],
  vendorQuickCommerceEnabled = false,
  disabled = false,
}) => {
  const enabled = value?.quickCommerceEnabled === true;
  const categoryId = value?.quickCommerceCategoryId || "";
  const details = value?.quickCommerce || {};

  const emit = (patch) => {
    onChange({
      quickCommerceEnabled: enabled,
      quickCommerceCategoryId: categoryId,
      ...value,
      ...patch,
      quickCommerce: {
        ...details,
        ...(patch.quickCommerce || {}),
      },
    });
  };

  const updateDetails = (patch) => emit({ quickCommerce: patch });

  const missingCategory = enabled && !categoryId;

  return (
    <div>
      <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
        <FiZap className="text-lg" />
        Quick Commerce
      </h2>

      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
          <label
            className={`flex items-center gap-2 text-sm ${
              vendorQuickCommerceEnabled ? "text-gray-700 cursor-pointer" : "text-gray-400 cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              checked={enabled}
              disabled={disabled || !vendorQuickCommerceEnabled}
              onChange={(e) => emit({ quickCommerceEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
            />
            Sell this product on Quick Commerce
          </label>
        </div>

        {!vendorQuickCommerceEnabled && (
          <p className="text-xs text-gray-500">
            Enable the Quick Commerce selling channel for this vendor before adding
            products to the Quick Commerce experience.
          </p>
        )}

        {enabled && (
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Quick Commerce Category <span className="text-red-500">*</span>
              </label>
              <select
                value={categoryId}
                disabled={disabled}
                onChange={(e) => emit({ quickCommerceCategoryId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="">Select a Quick Commerce category</option>
                {categories.map((category) => (
                  <option key={category.id || category._id} value={category.id || category._id}>
                    {category.parentId ? `— ${category.name}` : category.name}
                  </option>
                ))}
              </select>
              {missingCategory && (
                <p className="text-xs text-red-600 mt-1">
                  A Quick Commerce category is required.
                </p>
              )}
              {categories.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No Quick Commerce categories exist yet. An administrator needs to
                  create them first.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Pack Size</label>
                <input
                  type="text"
                  value={details.packSize ?? ""}
                  disabled={disabled}
                  onChange={(e) => updateDetails({ packSize: e.target.value })}
                  placeholder="500 ml, 1 kg"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Max Quantity Per Order
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={details.maxOrderQty ?? ""}
                  disabled={disabled}
                  onChange={(e) => updateDetails({ maxOrderQty: e.target.value })}
                  placeholder="No limit"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Stops one large order draining stock needed for quick deliveries.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Shelf Life (days)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={details.shelfLifeDays ?? ""}
                  disabled={disabled}
                  onChange={(e) => updateDetails({ shelfLifeDays: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={details.isPerishable === true}
                    disabled={disabled}
                    onChange={(e) => updateDetails({ isPerishable: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Perishable item
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Handling Note
                </label>
                <input
                  type="text"
                  value={details.handlingNote ?? ""}
                  disabled={disabled}
                  onChange={(e) => updateDetails({ handlingNote: e.target.value })}
                  placeholder="Keep refrigerated"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickCommerceProductSection;
