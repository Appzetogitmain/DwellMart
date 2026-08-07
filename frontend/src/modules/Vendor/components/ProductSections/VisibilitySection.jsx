/**
 * VisibilitySection — product flags: flash sale, new arrival, featured, visible,
 * COD allowed, returnable, cancelable
 */
const VisibilitySection = ({ formData, handleChange }) => (
  <div>
    <h2 className="text-base font-bold text-gray-800 mb-2">Product Options</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {[
        { name: "flashSale",    label: "Flash Sale" },
        { name: "isNewArrival", label: "New Arrival" },
        { name: "isFeatured",   label: "Featured Product" },
        { name: "isVisible",    label: "Visible to Customers" },
        { name: "codAllowed",   label: "COD Allowed" },
        { name: "returnable",   label: "Returnable" },
        { name: "cancelable",   label: "Cancelable" },
      ].map(({ name, label }) => (
        <label key={name} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name={name}
            checked={!!formData[name]}
            onChange={handleChange}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-xs font-semibold text-gray-700">{label}</span>
        </label>
      ))}
    </div>
  </div>
);

export default VisibilitySection;
