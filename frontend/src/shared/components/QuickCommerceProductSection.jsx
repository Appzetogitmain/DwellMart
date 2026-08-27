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
  disabled = false,
  isWorkspaceQuickCommerce = false,
  syncedCategoryName = "",
}) => {
  const enabled = value?.quickCommerceEnabled === true;
  const categoryId = value?.quickCommerceCategoryId || "";
  const details = value?.quickCommerce || {};

  if (!enabled) return null;

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

  // Resolve category name from list if not directly passed
  const resolvedCategoryName =
    syncedCategoryName ||
    categories.find((c) => String(c.id || c._id) === String(categoryId))?.name ||
    "";

  return (
    <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3 sm:p-4 space-y-4">
      <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
        <FiZap className="text-amber-500 text-base" />
        Quick Commerce Details
      </h3>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Quick Commerce Category <span className="text-red-500">*</span>
        </label>
        {isWorkspaceQuickCommerce ? (
          <div>
            <div className="relative">
              <input
                type="text"
                readOnly
                disabled
                value={resolvedCategoryName || "Select a category above under Basic Information"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100/90 text-gray-800 text-sm font-medium cursor-not-allowed pr-28"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                ✓ Auto-Synced
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Automatically synced from the Category selected above under Basic Information.
            </p>
          </div>
        ) : (
          <>
            <select
              value={categoryId}
              disabled={disabled}
              onChange={(e) => emit({ quickCommerceCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
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
          </>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
          />
        </div>
      </div>
    </div>
  );
};

export default QuickCommerceProductSection;
