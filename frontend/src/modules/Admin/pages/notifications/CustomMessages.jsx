import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash2, FiSearch, FiToggleLeft, FiToggleRight, FiLoader, FiSend } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../../components/DataTable';
import ConfirmModal from '../../components/ConfirmModal';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';
import {
  getCustomMessages,
  createCustomMessage,
  updateCustomMessage,
  deleteCustomMessage,
  toggleCustomMessage,
} from '../../services/adminService';

const EMPTY_FORM = { title: '', content: '', type: 'welcome', status: 'active', category: 'SYSTEM', priority: 'NORMAL', actionUrl: '' };

const CustomMessages = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAppRoute = location.pathname.startsWith('/app');

  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });

  // ── Fetch from API ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (currentPage = 1, search = '') => {
    setIsLoading(true);
    try {
      const res = await getCustomMessages({ page: currentPage, limit: 10, search: search || undefined });
      const data = res?.data || res || {};
      setMessages(data.messages || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setPages(data.pages || 1);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load custom messages.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages(1, '');
  }, [fetchMessages]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => fetchMessages(1, searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchMessages]);

  // ── Save (Create or Update) ─────────────────────────────────────────────────
  const handleSave = async (formData) => {
    setIsSaving(true);
    try {
      if (editingMessage?._id) {
        await updateCustomMessage(editingMessage._id, formData);
        toast.success('Message updated.');
      } else {
        await createCustomMessage(formData);
        toast.success('Message created.');
      }
      setEditingMessage(null);
      fetchMessages(page, searchQuery);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save message.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteCustomMessage(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null });
      toast.success('Message deleted.');
      fetchMessages(page, searchQuery);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete message.');
    }
  };

  // ── Toggle ──────────────────────────────────────────────────────────────────
  const handleToggle = async (id) => {
    try {
      const res = await toggleCustomMessage(id);
      const updated = res?.data || res;
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, status: updated.status } : m)));
      toast.success(`Message ${updated.status}.`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to toggle status.');
    }
  };

  // ── Table columns ───────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (value) => <span className="font-semibold text-gray-800">{value}</span>,
    },
    {
      key: 'content',
      label: 'Content',
      sortable: false,
      render: (value) => <p className="text-sm text-gray-600 max-w-md truncate">{value}</p>,
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (value) => (
        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium capitalize">
          {value}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value, row) => (
        <button
          onClick={() => handleToggle(row._id)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            value === 'active'
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {value === 'active' ? <FiToggleRight /> : <FiToggleLeft />}
          {value}
        </button>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/notifications/push-notifications', { state: { template: row } })}
            title="Send as Push Notification Broadcast"
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
          >
            <FiSend />
            <span className="hidden sm:inline">Send</span>
          </button>
          <button
            onClick={() => setEditingMessage(row)}
            title="Edit Template"
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <FiEdit />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row._id })}
            title="Delete Template"
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Custom Messages</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage automated customer messages</p>
        </div>
        <button
          onClick={() => setEditingMessage(EMPTY_FORM)}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
        >
          <FiPlus />
          <span>Add Message</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <FiLoader className="animate-spin" />
            <span>Loading messages...</span>
          </div>
        ) : (
          <>
            <DataTable data={messages} columns={columns} pagination={false} />
            {/* Pagination */}
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>{total} total messages</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchMessages(page - 1, searchQuery)}
                    disabled={page <= 1}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1">
                    {page} / {pages}
                  </span>
                  <button
                    onClick={() => fetchMessages(page + 1, searchQuery)}
                    disabled={page >= pages}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {editingMessage !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => !isSaving && setEditingMessage(null)}
              className="fixed inset-0 bg-black/50 z-[10000]"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[10000] flex ${isAppRoute ? 'items-start pt-[10px]' : 'items-end'} sm:items-center justify-center p-4 pointer-events-none`}
            >
              <motion.div
                variants={{
                  hidden: { y: isAppRoute ? '-100%' : '100%', scale: 0.95, opacity: 0 },
                  visible: {
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: { type: 'spring', damping: 22, stiffness: 350, mass: 0.7 },
                  },
                  exit: {
                    y: isAppRoute ? '-100%' : '100%',
                    scale: 0.95,
                    opacity: 0,
                    transition: { type: 'spring', damping: 30, stiffness: 400 },
                  },
                }}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className={`bg-white ${isAppRoute ? 'rounded-b-3xl' : 'rounded-t-3xl'} sm:rounded-xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto`}
              >
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingMessage._id ? 'Edit Message' : 'Add Message'}
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    handleSave({
                      title: fd.get('title'),
                      content: fd.get('content'),
                      type: editingMessage.type || 'welcome',
                      status: editingMessage.status || 'active',
                      category: editingMessage.category || 'SYSTEM',
                      priority: editingMessage.priority || 'NORMAL',
                      actionUrl: fd.get('actionUrl') || '',
                      image: fd.get('image') || editingMessage.image || '',
                    });
                  }}
                  className="space-y-4"
                >
                  <input
                    type="text"
                    name="title"
                    defaultValue={editingMessage.title || ''}
                    placeholder="Message Title"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <textarea
                    name="content"
                    defaultValue={editingMessage.content || ''}
                    placeholder="Message Content"
                    required
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <AnimatedSelect
                    name="type"
                    value={editingMessage.type || 'welcome'}
                    onChange={(e) => setEditingMessage({ ...editingMessage, type: e.target.value })}
                    options={[
                      { value: 'welcome', label: 'Welcome' },
                      { value: 'order', label: 'Order' },
                      { value: 'promotional', label: 'Promotional' },
                      { value: 'reminder', label: 'Reminder' },
                    ]}
                  />
                  <AnimatedSelect
                    name="status"
                    value={editingMessage.status || 'active'}
                    onChange={(e) => setEditingMessage({ ...editingMessage, status: e.target.value })}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                  />
                  <input
                    type="text"
                    name="actionUrl"
                    defaultValue={editingMessage.actionUrl || ''}
                    placeholder="Action URL (optional, e.g. /products)"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold disabled:opacity-60"
                    >
                      {isSaving ? <FiLoader className="animate-spin" /> : null}
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => !isSaving && setEditingMessage(null)}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-semibold disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Message?"
        message="Are you sure you want to delete this message? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default CustomMessages;
