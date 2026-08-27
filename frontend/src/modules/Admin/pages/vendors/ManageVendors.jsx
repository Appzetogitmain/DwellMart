import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiDollarSign,
  FiTrash2,
} from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useVendorStore } from "../../store/vendorStore";
import { useAdminAuthStore } from "../../store/adminStore";
import { PERMISSIONS } from "../../config/permissions";
import toast from "react-hot-toast";
import { VendorWholesaleBadge } from "../../../../shared/components/WholesaleBadge";

const ManageVendors = () => {
  const navigate = useNavigate();
  const { admin, can } = useAdminAuthStore();
  const { vendors, initialize, updateVendorStatus, updateCommissionRate, deleteVendor } =
    useVendorStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [actionModal, setActionModal] = useState({
    isOpen: false,
    type: null, // 'approve', 'activate', 'suspend', 'commission', 'hard_delete'
    vendorId: null,
    vendorName: null,
  });
  const [commissionRate, setCommissionRate] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Get vendor statistics
  const getVendorStats = (vendorId) => {
    const vendor = vendors.find((v) => String(v.id) === String(vendorId));
    return {
      totalOrders: vendor?.totalOrders || 0,
      totalEarnings: vendor?.totalEarnings || 0,
      pendingEarnings: vendor?.pendingEarnings || 0,
      commissionRate: vendor?.commissionRate || 0,
    };
  };

  const filteredVendors = useMemo(() => {
    let filtered = vendors;

    if (searchQuery) {
      filtered = filtered.filter(
        (vendor) =>
          vendor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.storeName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((vendor) => vendor.status === selectedStatus);
    }

    return filtered;
  }, [vendors, searchQuery, selectedStatus]);

  const columns = [
    {
      key: "storeName",
      label: "Store Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          {row.storeLogo && (
            <img
              src={row.storeLogo}
              alt={value}
              className="w-10 h-10 object-cover rounded-lg"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-800">
                {value || row.name}
              </span>
              {(row.channels?.retail?.status === 'active' || row.sellingChannels?.retail?.enabled) && (
                <Badge variant="neutral" size="sm">Retail</Badge>
              )}
              {(row.channels?.wholesale?.status === 'active' || row.sellingChannels?.wholesale?.enabled || row.vendorType === 'wholesale') && (
                <Badge variant="success" size="sm">Wholesale</Badge>
              )}
              {(row.channels?.quickCommerce?.status === 'active' || row.sellingChannels?.quickCommerce?.enabled || row.vendorType === 'quick_commerce') && (
                <Badge variant="info" size="sm">Quick Commerce</Badge>
              )}
              {Object.values(row.channels || {}).some((c) => c?.status === 'requested') && (
                <span
                  title="Vendor has pending selling channel requests"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/admin/vendors/${row.id}?tab=channels`);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Channel Request
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{row.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (value) => <span className="text-sm text-gray-700">{value}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "approved"
              ? "success"
              : value === "pending"
                ? "warning"
                : "error"
          }>
          {value?.toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "commissionRate",
      label: "Commission",
      sortable: true,
      render: (value, row) => {
        const rate = value || row.commissionRate || 0;
        return (
          <span className="text-sm font-semibold text-gray-800">
            {(rate * 100).toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: "stats",
      label: "Performance",
      sortable: false,
      render: (_, row) => {
        const stats = getVendorStats(row.id);
        return (
          <div className="text-xs">
            <p className="text-gray-700">
              <span className="font-semibold">{stats.totalOrders}</span> orders
            </p>
            <p className="text-gray-500">
              {formatPrice(stats.totalEarnings)} earned
            </p>
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => {
        const canDelete = admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_DELETE);
        const canApprove = admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_APPROVE);
        const canEdit = admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_EDIT);

        return (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/admin/vendors/${row.id}`);
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="View Details">
              <FiEye />
            </button>
            {row.status === "pending" && canApprove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActionModal({
                    isOpen: true,
                    type: "approve",
                    vendorId: row.id,
                    vendorName: row.storeName || row.name,
                  });
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve Vendor">
                <FiCheckCircle />
              </button>
            )}
            {row.status === "approved" && canApprove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActionModal({
                    isOpen: true,
                    type: "suspend",
                    vendorId: row.id,
                    vendorName: row.storeName || row.name,
                  });
                }}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Suspend Vendor">
                <FiXCircle />
              </button>
            )}
            {row.status === "suspended" && canApprove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActionModal({
                    isOpen: true,
                    type: "activate",
                    vendorId: row.id,
                    vendorName: row.storeName || row.name,
                  });
                }}
                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                title="Activate Vendor">
                <FiCheckCircle />
              </button>
            )}
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const vendor = vendors.find((v) => v.id === row.id);
                  setCommissionRate(
                    ((vendor?.commissionRate || 0) * 100).toFixed(1)
                  );
                  setActionModal({
                    isOpen: true,
                    type: "commission",
                    vendorId: row.id,
                    vendorName: row.storeName || row.name,
                  });
                }}
                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                title="Update Commission Rate">
                <FiDollarSign />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmationInput("");
                  setActionModal({
                    isOpen: true,
                    type: "hard_delete",
                    vendorId: row.id,
                    vendorName: row.storeName || row.name,
                  });
                }}
                className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Permanently Delete Test Vendor">
                <FiTrash2 />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const handleApprove = async () => {
    const success = await updateVendorStatus(actionModal.vendorId, "approved");
    if (success) {
      toast.success("Vendor approved successfully");
      setActionModal({
        isOpen: false,
        type: null,
        vendorId: null,
        vendorName: null,
      });
    } else {
      toast.error("Failed to approve vendor");
    }
  };

  const handleActivate = async () => {
    const success = await updateVendorStatus(actionModal.vendorId, "approved");
    if (success) {
      toast.success("Vendor activated successfully");
      setActionModal({
        isOpen: false,
        type: null,
        vendorId: null,
        vendorName: null,
      });
    } else {
      toast.error("Failed to activate vendor");
    }
  };

  const handleSuspend = async () => {
    const success = await updateVendorStatus(
      actionModal.vendorId,
      "suspended",
      statusReason.trim()
    );
    if (success) {
      toast.success("Vendor suspended successfully");
      setActionModal({
        isOpen: false,
        type: null,
        vendorId: null,
        vendorName: null,
      });
      setStatusReason("");
    } else {
      toast.error("Failed to suspend vendor");
    }
  };

  const handleHardDelete = async () => {
    if (deleteConfirmationInput !== "DELETE") {
      toast.error("Please type DELETE to confirm permanent deletion");
      return;
    }
    try {
      await deleteVendor(actionModal.vendorId);
      toast.success("Vendor deleted permanently");
      setActionModal({
        isOpen: false,
        type: null,
        vendorId: null,
        vendorName: null,
      });
      setDeleteConfirmationInput("");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to delete vendor");
    }
  };

  const handleCommissionUpdate = async () => {
    const rate = parseFloat(commissionRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast.error("Please enter a valid commission rate (0-100%)");
      return;
    }
    const success = await updateCommissionRate(actionModal.vendorId, rate);
    if (success) {
      toast.success("Commission rate updated successfully");
      setActionModal({
        isOpen: false,
        type: null,
        vendorId: null,
        vendorName: null,
      });
      setCommissionRate("");
    } else {
      toast.error("Failed to update commission rate");
    }
  };

  const getModalContent = () => {
    switch (actionModal.type) {
      case "approve":
        return {
          title: "Approve Vendor?",
          message: `Are you sure you want to approve "${actionModal.vendorName}"? They will be able to start selling on the platform.`,
          confirmText: "Approve",
          onConfirm: handleApprove,
          type: "success",
        };
      case "activate":
        return {
          title: "Activate Vendor?",
          message: `Are you sure you want to activate "${actionModal.vendorName}"? The vendor will be restored to approved status and allowed to operate on their configured selling channels.`,
          confirmText: "Activate Vendor",
          onConfirm: handleActivate,
          type: "success",
        };
      case "suspend":
        return {
          title: "Suspend Vendor?",
          message: `Are you sure you want to suspend "${actionModal.vendorName}"? They will not be able to access their vendor dashboard.`,
          confirmText: "Suspend",
          onConfirm: handleSuspend,
          type: "danger",
          customContent: (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Suspension Reason (optional)
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
                placeholder="Provide a reason for suspension..."
              />
            </div>
          ),
        };
      case "hard_delete":
        return {
          title: "Permanently Delete Vendor?",
          message: `This will permanently remove "${actionModal.vendorName}" and all associated products, documents, and settings from the database. This action CANNOT be undone.`,
          confirmText: "Permanently Delete",
          onConfirm: handleHardDelete,
          type: "danger",
          confirmDisabled: deleteConfirmationInput !== "DELETE",
          customContent: (
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                <p className="font-semibold">Warning: Destructive Permanent Action</p>
                <p className="mt-1">Vendors with active customer orders cannot be deleted. Use this only for test/QA vendors.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  Type <span className="font-mono text-red-600 dark:text-red-400 font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
            </div>
          ),
        };
      case "commission":
        return {
          title: "Update Commission Rate",
          message: `Update commission rate for "${actionModal.vendorName}"`,
          confirmText: "Update",
          onConfirm: handleCommissionUpdate,
          type: "info",
          customContent: (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Commission Rate (%)
              </label>
              <input
                type="number"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
                placeholder="10.0"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Enter a value between 0 and 100
              </p>
            </div>
          ),
        };
      default:
        return null;
    }
  };

  const modalContent = getModalContent();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Manage Vendors
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View and manage all vendors on the platform
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Filters Section */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vendors..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              />
            </div>

            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: "all", label: "All Status" },
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "suspended", label: "Suspended" },
                { value: "rejected", label: "Rejected" },
              ]}
              className="w-full sm:w-auto min-w-[140px]"
            />

            <div className="w-full sm:w-auto">
              <ExportButton
                data={filteredVendors}
                headers={[
                  {
                    label: "Store Name",
                    accessor: (row) => row.storeName || row.name,
                  },
                  { label: "Email", accessor: (row) => row.email },
                  { label: "Status", accessor: (row) => row.status },
                  {
                    label: "Commission Rate",
                    accessor: (row) =>
                      `${((row.commissionRate || 0) * 100).toFixed(1)}%`,
                  },
                  {
                    label: "Join Date",
                    accessor: (row) =>
                      row.joinDate ? new Date(row.joinDate).toLocaleDateString() : "N/A",
                  },
                ]}
                filename="vendors"
              />
            </div>
          </div>
        </div>

        {/* DataTable */}
        <DataTable
          data={filteredVendors}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
          onRowClick={(row) => navigate(`/admin/vendors/${row.id}`)}
        />
      </div>

      {/* Action Modals */}
      {modalContent && (
        <ConfirmModal
          isOpen={actionModal.isOpen}
          onClose={() => {
            setActionModal({
              isOpen: false,
              type: null,
              vendorId: null,
              vendorName: null,
            });
            setCommissionRate("");
            setStatusReason("");
          }}
          onConfirm={modalContent.onConfirm}
          title={modalContent.title}
          message={modalContent.message}
          confirmText={modalContent.confirmText}
          cancelText="Cancel"
          type={modalContent.type}
          customContent={modalContent.customContent}
          confirmDisabled={modalContent.confirmDisabled}
        />
      )}
    </motion.div>
  );
};

export default ManageVendors;
