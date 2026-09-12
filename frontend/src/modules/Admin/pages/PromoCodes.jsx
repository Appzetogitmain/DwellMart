import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiTag, FiCopy, FiCheck } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../components/DataTable';
import ExportButton from '../components/ExportButton';
import ConfirmModal from '../components/ConfirmModal';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';
import toast from 'react-hot-toast';

import { useCouponStore } from '../../../shared/store/couponStore';

const PromoCodes = () => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');

  const { coupons, isLoading, fetchCoupons, addCoupon, updateCoupon, deleteCoupon } = useCouponStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingCode, setEditingCode] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });
  const [copiedCode, setCopiedCode] = useState(null);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const normalizedCodes = useMemo(() => {
    const now = Date.now();
    return (coupons || []).map((coupon) => {
      const startDate = coupon.startDate || coupon.startsAt || null;
      const endDate = coupon.endDate || coupon.expiresAt || null;
      const startMs = startDate ? new Date(startDate).getTime() : null;
      const endMs = endDate ? new Date(endDate).getTime() : null;

      let status = 'inactive';
      if (endMs && endMs < now) status = 'expired';
      else if (startMs && startMs > now) status = 'upcoming';
      else if (coupon.isActive) status = 'active';

      return {
        ...coupon,
        minPurchase: coupon.minPurchase ?? coupon.minOrderValue ?? 0,
        startDate,
        endDate,
        status,
      };
    });
  }, [coupons]);

  const filteredCodes = normalizedCodes.filter((code) => {
    const matchesSearch =
      !searchQuery ||
      code.code.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || code.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleSave = async (codeData) => {
    try {
      if (editingCode && editingCode._id) {
        await updateCoupon(editingCode._id, codeData);
      } else {
        await addCoupon(codeData);
      }
      setEditingCode(null);
    } catch (error) {
      // Error already handled by store toast
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCoupon(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null });
    } catch (error) {
      // Error already handled by store toast
    }
  };

  const copyToClipboard = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await updateCoupon(id, { isActive: !currentStatus });
    } catch (error) {
      // Error already handled by store toast
    }
  };

  const columns = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-primary-600">{value}</span>
          <button
            onClick={() => copyToClipboard(value)}
            className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
            title="Copy code"
          >
            {copiedCode === value ? <FiCheck className="text-green-600" /> : <FiCopy />}
          </button>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (value, row) => (
        <div>
          <span className="text-sm font-medium text-gray-800">
            {value === 'percentage'
              ? `${row.value}%`
              : value === 'freeship'
                ? 'Free Shipping'
                : formatCurrency(row.value)}
          </span>
          <p className="text-xs text-gray-500">
            {value === 'percentage'
              ? 'Percentage'
              : value === 'freeship'
                ? 'Shipping Waiver'
                : 'Fixed Amount'}
          </p>
        </div>
      ),
    },
    {
      key: 'minPurchase',
      label: 'Min Purchase',
      sortable: true,
      render: (value) => value > 0 ? formatCurrency(value) : 'No minimum',
    },
    {
      key: 'usageLimit',
      label: 'Usage',
      sortable: true,
      render: (value, row) => (
        <div>
          <span className="text-sm font-medium text-gray-800">
            {row.usedCount} / {value === null || value === undefined ? 'Unlimited' : value}
          </span>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div
              className="bg-primary-600 h-1.5 rounded-full"
              style={{ width: `${!value ? 0 : Math.min((row.usedCount / value) * 100, 100)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'endDate',
      label: 'Valid Until',
      sortable: true,
      render: (value) => formatDateTime(value),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value, row) => (
        <button
          onClick={() => handleToggleStatus(row._id, row.isActive)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${value === 'active'
            ? 'bg-green-100 text-green-800 hover:bg-green-200'
            : value === 'upcoming'
              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              : value === 'expired'
                ? 'bg-red-100 text-red-800 hover:bg-red-200'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
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
            onClick={() => setEditingCode(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <FiEdit />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row._id })}
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Promo Codes</h1>
          <p className="text-sm sm:text-base text-gray-600">Create and manage discount codes</p>
        </div>
        <button
          onClick={() => setEditingCode({ code: '', type: 'percentage', value: '', minPurchase: 0, maxDiscount: '', usageLimit: '', startDate: '', endDate: '', status: 'active', isActive: true })}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
        >
          <FiPlus />
          <span>Add Promo Code</span>
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search promo codes..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'expired', label: 'Expired' },
            ]}
            className="min-w-[140px]"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <ExportButton
            data={filteredCodes}
            headers={[
              { label: 'Code', accessor: (row) => row.code },
              { label: 'Type', accessor: (row) => row.type },
              {
                label: 'Value',
                accessor: (row) =>
                  row.type === 'percentage'
                    ? `${row.value}%`
                    : row.type === 'freeship'
                      ? 'Free Shipping'
                      : formatCurrency(row.value),
              },
              { label: 'Min Purchase', accessor: (row) => formatCurrency(row.minPurchase) },
              { label: 'Usage', accessor: (row) => `${row.usedCount} / ${row.usageLimit ?? 'Unlimited'}` },
              { label: 'Status', accessor: (row) => row.status },
            ]}
            filename="promo-codes"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={filteredCodes}
          columns={columns}
          pagination={true}
          itemsPerPage={itemsPerPage}
          showSizeChanger={true}
          onPageSizeChange={(newSize) => setItemsPerPage(newSize)}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
        />
      </div>

      <AnimatePresence>
        {editingCode !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setEditingCode(null)}
              className="fixed inset-0 bg-black/50 z-[10000]"
            />

            {/* Modal Content - Mobile: Slide up from bottom, Desktop: Center with scale */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[10000] flex ${isAppRoute ? 'items-start pt-[10px]' : 'items-end'} sm:items-center justify-center p-4 pointer-events-none`}
            >
              <motion.div
                variants={{
                  hidden: {
                    y: isAppRoute ? '-100%' : '100%',
                    scale: 0.95,
                    opacity: 0
                  },
                  visible: {
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: {
                      type: 'spring',
                      damping: 22,
                      stiffness: 350,
                      mass: 0.7
                    }
                  },
                  exit: {
                    y: isAppRoute ? '-100%' : '100%',
                    scale: 0.95,
                    opacity: 0,
                    transition: {
                      type: 'spring',
                      damping: 30,
                      stiffness: 400
                    }
                  }
                }}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className={`bg-white ${isAppRoute ? 'rounded-b-3xl' : 'rounded-t-3xl'} sm:rounded-xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto`}
                style={{ willChange: 'transform' }}
              >
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingCode._id ? 'Edit Promo Code' : 'Add Promo Code'}
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const startDate = formData.get('startDate') || null;
                    const endDate = formData.get('endDate') || null;
                    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
                      toast.error('End date must be after start date');
                      return;
                    }

                    const type = formData.get('type');
                    const usageLimitRaw = formData.get('usageLimit');
                    const usageLimit = usageLimitRaw === '' ? null : parseInt(usageLimitRaw, 10);
                    const maxDiscountRaw = formData.get('maxDiscount');
                    const isFreeShip = type === 'freeship';

                    handleSave({
                      code: formData.get('code').toUpperCase(),
                      type,
                      value: isFreeShip ? 0 : parseFloat(formData.get('value')),
                      minOrderValue: parseFloat(formData.get('minPurchase')) || 0,
                      maxDiscount: type === 'percentage' && maxDiscountRaw !== '' ? parseFloat(maxDiscountRaw) : null,
                      usageLimit: usageLimit === null || usageLimit < 0 ? null : usageLimit,
                      startsAt: startDate,
                      expiresAt: endDate,
                      isActive: formData.get('status') === 'active',
                    });
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FiTag className="inline mr-2" />
                      Promo Code
                    </label>
                    <input
                      type="text"
                      name="code"
                      defaultValue={editingCode.code || ''}
                      placeholder="SAVE20"
                      required
                      maxLength={20}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                      <AnimatedSelect
                        name="type"
                        value={editingCode.type || 'percentage'}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setEditingCode({
                            ...editingCode,
                            type: nextType,
                            ...(nextType === 'freeship' ? { value: 0, maxDiscount: '' } : {}),
                          });
                        }}
                        options={[
                          { value: 'percentage', label: 'Percentage' },
                          { value: 'fixed', label: 'Fixed Amount' },
                          { value: 'freeship', label: 'Free Shipping' },
                        ]}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Discount Value</label>
                      <input
                        type="number"
                        name="value"
                        defaultValue={editingCode.type === 'freeship' ? 0 : (editingCode.value || '')}
                        placeholder={editingCode.type === 'fixed' ? '50.00' : editingCode.type === 'freeship' ? '0 (auto)' : '20'}
                        required
                        min="0"
                        step={editingCode.type === 'fixed' ? '0.01' : '1'}
                        max={editingCode.type === 'percentage' ? '100' : ''}
                        readOnly={editingCode.type === 'freeship'}
                        disabled={editingCode.type === 'freeship'}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Min Purchase</label>
                      <input
                        type="number"
                        name="minPurchase"
                        defaultValue={editingCode.minPurchase ?? '0'}
                        required
                        min="0"
                        step="0.01"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Max Discount</label>
                      <input
                        type="number"
                        name="maxDiscount"
                        defaultValue={editingCode.type === 'freeship' ? '' : (editingCode.maxDiscount ?? '')}
                        min="0"
                        step="0.01"
                        readOnly={editingCode.type === 'freeship'}
                        disabled={editingCode.type === 'freeship'}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Usage Limit</label>
                    <input
                      type="number"
                      name="usageLimit"
                      defaultValue={editingCode.usageLimit ?? ''}
                      placeholder="Leave empty for unlimited"
                      min="-1"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter -1 for unlimited usage</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                      <input
                        type="datetime-local"
                        name="startDate"
                        defaultValue={editingCode.startDate ? new Date(editingCode.startDate).toISOString().slice(0, 16) : ''}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                      <input
                        type="datetime-local"
                        name="endDate"
                        defaultValue={editingCode.endDate ? new Date(editingCode.endDate).toISOString().slice(0, 16) : ''}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <AnimatedSelect
                      name="status"
                      value={editingCode.status === 'inactive' ? 'inactive' : 'active'}
                      onChange={(e) =>
                        setEditingCode({
                          ...editingCode,
                          status: e.target.value,
                          isActive: e.target.value === 'active',
                        })
                      }
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                      ]}
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCode(null)}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
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
        title="Delete Promo Code?"
        message="Are you sure you want to delete this promo code? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default PromoCodes;


