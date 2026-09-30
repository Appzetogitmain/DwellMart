import React, { useState } from "react";
import { FiX, FiTag } from "react-icons/fi";

const TagInput = ({
  tags = [],
  onChange,
  placeholder = "Type tag and press comma or Enter...",
  className = "",
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState("");

  const addTags = (text) => {
    if (!text || disabled) return;
    const pieces = text
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (pieces.length === 0) return;

    const currentTags = Array.isArray(tags) ? [...tags] : [];
    let updated = false;

    pieces.forEach((piece) => {
      // Avoid duplicate tags (case-insensitive check)
      if (!currentTags.some((existing) => existing.toLowerCase() === piece.toLowerCase())) {
        currentTags.push(piece);
        updated = true;
      }
    });

    if (updated && onChange) {
      onChange(currentTags);
    }
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      addTags(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      e.preventDefault();
      const updated = tags.slice(0, -1);
      if (onChange) onChange(updated);
    }
  };

  const handleChange = (e) => {
    if (disabled) return;
    const val = e.target.value;
    if (val.includes(",")) {
      addTags(val);
    } else {
      setInputValue(val);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTags(inputValue);
    }
  };

  const removeTag = (indexToRemove) => {
    if (disabled) return;
    const updated = (Array.isArray(tags) ? tags : []).filter((_, idx) => idx !== indexToRemove);
    if (onChange) onChange(updated);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div
        className={`flex flex-wrap items-center gap-1.5 p-2 border rounded-xl bg-white min-h-[42px] transition-all ${
          disabled
            ? "bg-gray-100 border-gray-200 cursor-not-allowed"
            : "border-gray-300 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent hover:border-gray-400"
        }`}
      >
        <FiTag className="text-gray-400 w-4 h-4 ml-1 shrink-0" />
        {(Array.isArray(tags) ? tags : []).map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200"
          >
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="text-gray-400 hover:text-red-500 rounded p-0.5 transition-colors focus:outline-none"
                title="Remove tag"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={tags.length === 0 ? placeholder : "Add another tag..."}
            className="flex-1 min-w-[140px] text-sm outline-none bg-transparent px-1.5 py-0.5 text-gray-800 placeholder:text-gray-400"
          />
        )}
      </div>
      <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
        <span>Type a keyword and press</span>
        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono text-gray-600">Enter</kbd>
        <span>or</span>
        <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono text-gray-600">,</kbd>
        <span>to add tag</span>
      </p>
    </div>
  );
};

export default TagInput;
