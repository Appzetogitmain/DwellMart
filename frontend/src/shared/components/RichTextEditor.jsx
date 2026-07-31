import React, { useState, useRef, useEffect } from 'react';
import {
  FiBold,
  FiItalic,
  FiUnderline,
  FiList,
  FiAlignLeft,
  FiAlignCenter,
  FiAlignRight,
  FiAlignJustify,
  FiLink,
  FiCode,
  FiRotateCcw,
} from 'react-icons/fi';

const ensureHtml = (text) => {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '<br/>'))
    .join('');
};

const RichTextEditor = ({ value, onChange, placeholder = 'Write policy content here...' }) => {
  const editorRef = useRef(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState(ensureHtml(value || ''));
  const isInternalChange = useRef(false);

  // Sync value from props when changed externally
  useEffect(() => {
    if (!isInternalChange.current) {
      const formatted = ensureHtml(value || '');
      setHtmlContent(formatted);
      if (editorRef.current && !isSourceMode) {
        editorRef.current.innerHTML = formatted;
      }
    }
    isInternalChange.current = false;
  }, [value, isSourceMode]);

  // Handle content update from contentEditable
  const handleInput = () => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      isInternalChange.current = true;
      setHtmlContent(currentHtml);
      onChange(currentHtml);
    }
  };

  // Execute formatting commands
  const execCmd = (command, cmdValue = null) => {
    try {
      document.execCommand('styleWithCSS', false, true);
    } catch {
      // Fallback if styleWithCSS is not supported in browser
    }
    document.execCommand(command, false, cmdValue);
    handleInput();
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  // Add Link
  const handleAddLink = () => {
    const url = prompt('Enter the URL (e.g. https://example.com):');
    if (url) {
      execCmd('createLink', url);
    }
  };

  // Format Block (headings, p)
  const handleBlockFormat = (tag) => {
    execCmd('formatBlock', `<${tag}>`);
  };

  // Color change
  const handleColorChange = (e) => {
    execCmd('foreColor', e.target.value);
  };

  // Background Highlight
  const handleBgColorChange = (e) => {
    execCmd('hiliteColor', e.target.value);
  };

  // Toggle visual vs raw HTML source mode
  const toggleSourceMode = () => {
    if (isSourceMode) {
      setIsSourceMode(false);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = htmlContent;
        }
      }, 0);
    } else {
      setIsSourceMode(true);
    }
  };

  const handleSourceChange = (e) => {
    const newContent = e.target.value;
    setHtmlContent(newContent);
    isInternalChange.current = true;
    onChange(newContent);
  };

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden bg-white shadow-sm transition-all focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
      {/* Toolbar */}
      <div className="bg-slate-100 border-b border-gray-200 p-2 flex flex-wrap items-center gap-1 sm:gap-2 select-none">
        
        {/* Paragraph / Headings */}
        <select
          onChange={(e) => handleBlockFormat(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
          title="Text Style"
          disabled={isSourceMode}
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Blockquote</option>
        </select>

        <div className="h-4 w-px bg-gray-300 mx-0.5" />

        {/* Text Formatting */}
        <button
          type="button"
          onClick={() => execCmd('bold')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 font-bold transition-colors disabled:opacity-40"
          title="Bold (Ctrl+B)"
          disabled={isSourceMode}
        >
          <FiBold className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('italic')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 italic transition-colors disabled:opacity-40"
          title="Italic (Ctrl+I)"
          disabled={isSourceMode}
        >
          <FiItalic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('underline')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 underline transition-colors disabled:opacity-40"
          title="Underline (Ctrl+U)"
          disabled={isSourceMode}
        >
          <FiUnderline className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('strikeThrough')}
          className="p-1.5 px-2 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Strikethrough"
          disabled={isSourceMode}
        >
          <span className="line-through font-extrabold text-xs">S</span>
        </button>

        <div className="h-4 w-px bg-gray-300 mx-0.5" />

        {/* Lists */}
        <button
          type="button"
          onClick={() => execCmd('insertUnorderedList')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Bullet List"
          disabled={isSourceMode}
        >
          <FiList className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('insertOrderedList')}
          className="p-1.5 px-2 rounded hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors disabled:opacity-40"
          title="Numbered List"
          disabled={isSourceMode}
        >
          1.
        </button>

        <div className="h-4 w-px bg-gray-300 mx-0.5" />

        {/* Alignment */}
        <button
          type="button"
          onClick={() => execCmd('justifyLeft')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Align Left"
          disabled={isSourceMode}
        >
          <FiAlignLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('justifyCenter')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Align Center"
          disabled={isSourceMode}
        >
          <FiAlignCenter className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('justifyRight')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Align Right"
          disabled={isSourceMode}
        >
          <FiAlignRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => execCmd('justifyFull')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Justify"
          disabled={isSourceMode}
        >
          <FiAlignJustify className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-gray-300 mx-0.5" />

        {/* Color pickers */}
        <div className="flex items-center gap-1" title="Text Color">
          <span className="text-[10px] font-bold text-gray-500 uppercase">Color:</span>
          <input
            type="color"
            onChange={handleColorChange}
            disabled={isSourceMode}
            className="w-6 h-6 rounded cursor-pointer border border-gray-300 bg-transparent p-0"
          />
        </div>

        <div className="flex items-center gap-1 ml-1" title="Highlight Color">
          <span className="text-[10px] font-bold text-gray-500 uppercase">Bg:</span>
          <input
            type="color"
            defaultValue="#ffff00"
            onChange={handleBgColorChange}
            disabled={isSourceMode}
            className="w-6 h-6 rounded cursor-pointer border border-gray-300 bg-transparent p-0"
          />
        </div>

        <div className="h-4 w-px bg-gray-300 mx-0.5" />

        {/* Link */}
        <button
          type="button"
          onClick={handleAddLink}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Insert Link"
          disabled={isSourceMode}
        >
          <FiLink className="w-4 h-4" />
        </button>

        {/* Horizontal Line */}
        <button
          type="button"
          onClick={() => execCmd('insertHorizontalRule')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors disabled:opacity-40"
          title="Insert Divider"
          disabled={isSourceMode}
        >
          —
        </button>

        {/* Clear formatting */}
        <button
          type="button"
          onClick={() => execCmd('removeFormat')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-40"
          title="Clear Formatting"
          disabled={isSourceMode}
        >
          <FiRotateCcw className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* Source Code View Toggle */}
        <button
          type="button"
          onClick={toggleSourceMode}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors border ${
            isSourceMode
              ? 'bg-amber-500 text-white border-amber-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-200'
          }`}
          title="Toggle HTML Source Code View"
        >
          <FiCode className="w-3.5 h-3.5" />
          <span>{isSourceMode ? 'Visual Editor' : 'HTML Code'}</span>
        </button>
      </div>

      {/* Editor Content Box */}
      {isSourceMode ? (
        <textarea
          value={htmlContent}
          onChange={handleSourceChange}
          rows={18}
          placeholder="Edit raw HTML code..."
          className="w-full p-4 font-mono text-xs bg-slate-900 text-amber-300 border-0 focus:outline-none focus:ring-0 resize-y"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={handleInput}
          suppressContentEditableWarning
          className="p-5 min-h-[380px] max-h-[600px] overflow-y-auto focus:outline-none text-gray-800 text-sm leading-relaxed prose prose-slate max-w-none"
        />
      )}
    </div>
  );
};

export default RichTextEditor;
