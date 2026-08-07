/**
 * TagsAndFAQsSection — product tags + FAQ accordion
 */
const TagsAndFAQsSection = ({ formData, setFormData, handleFaqChange, addFaq, removeFaq }) => (
  <div className="space-y-4">
    {/* Tags */}
    <div>
      <h2 className="text-base font-bold text-gray-800 mb-2">Tags</h2>
      <input
        type="text"
        value={(formData.tags || []).join(", ")}
        onChange={(e) => {
          const tags = e.target.value
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t);
          setFormData((prev) => ({ ...prev, tags }));
        }}
        placeholder="tag1, tag2, tag3"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
      />
      <p className="mt-1 text-xs text-gray-500">Separate tags with commas</p>
    </div>

    {/* FAQs */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800">Product FAQs</h2>
        <button
          type="button"
          onClick={addFaq}
          className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Add FAQ
        </button>
      </div>
      <div className="space-y-3">
        {(formData.faqs || []).map((faq, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">FAQ #{index + 1}</p>
              <button
                type="button"
                onClick={() => removeFaq(index)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={faq.question || ""}
              onChange={(e) => handleFaqChange(index, "question", e.target.value)}
              placeholder="Question"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
            />
            <textarea
              value={faq.answer || ""}
              onChange={(e) => handleFaqChange(index, "answer", e.target.value)}
              rows={2}
              placeholder="Answer"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
            />
          </div>
        ))}
        {(formData.faqs || []).length === 0 && (
          <p className="text-xs text-gray-500">No FAQs added yet.</p>
        )}
      </div>
    </div>
  </div>
);

export default TagsAndFAQsSection;
