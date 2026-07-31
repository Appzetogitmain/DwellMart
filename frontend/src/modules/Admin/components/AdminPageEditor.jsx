import { useState, useEffect } from 'react';
import { FiSave, FiFileText } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import RichTextEditor from '../../../shared/components/RichTextEditor';

/**
 * Reusable admin page editor with Rich Text Editor.
 * Props:
 *   slug        — e.g. "terms", "about", "contact"
 *   pageTitle   — h1 text shown on the page
 *   description — subtitle shown on the page
 *   placeholder — placeholder text for the editor
 */
const AdminPageEditor = ({ slug, pageTitle, description, placeholder = 'Write your content here...' }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const res = await api.get(`/admin/pages/${slug}`);
        const data = res.data?.data || res.data;
        setTitle(data?.title || '');
        setContent(data?.content || '');
      } catch {
        // Page not yet created — just start with empty content
      } finally {
        setIsLoading(false);
      }
    };
    fetchContent();
  }, [slug]);

  const handleSave = async () => {
    if (!content || !content.trim()) {
      toast.error('Content cannot be empty.');
      return;
    }
    setIsSaving(true);
    try {
      await api.put(`/admin/pages/${slug}`, { title, content });
      toast.success(`${pageTitle} saved successfully.`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save page.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">{pageTitle}</h1>
          <p className="text-sm sm:text-base text-gray-600">{description}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm disabled:opacity-60"
        >
          <FiSave />
          <span>{isSaving ? 'Saving...' : 'Save Page'}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      ) : (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FiFileText className="text-primary-600" />
            <h3 className="font-semibold text-gray-800">{pageTitle} Content</h3>
          </div>

          {/* Optional page title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Page Heading (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${pageTitle}`}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Rich Text Content Editor */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Page Body Content</label>
            <RichTextEditor
              value={content}
              onChange={(newHtml) => setContent(newHtml)}
              placeholder={placeholder}
            />
            <p className="text-xs text-gray-400 mt-1">Design your page using headings, colors, lists, formatting, or custom HTML.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default AdminPageEditor;
