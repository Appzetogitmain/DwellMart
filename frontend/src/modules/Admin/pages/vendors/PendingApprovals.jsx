import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FiSearch, FiEye, FiCheckCircle, FiXCircle, FiGrid } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import ConfirmModal from "../../components/ConfirmModal";
import { useVendorStore } from "../../store/vendorStore";
import { VENDOR_TYPE_LABELS } from "../../../../shared/config/vendorCapabilities";
import { getImageUrl } from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";

const PendingApprovals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendors, updateVendorStatus, initialize } = useVendorStore();

  const queryType = new URLSearchParams(location.search).get("type");
  const [activeApprovalTab, setActiveApprovalTab] = useState(
    queryType === "channels" ? "channels" : "accounts"
  );

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const currentType = new URLSearchParams(location.search).get("type");
    if (currentType === "channels") {
      setActiveApprovalTab("channels");
    } else if (currentType === "accounts") {
      setActiveApprovalTab("accounts");
    }
  }, [location.search]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVendorChannels, setSelectedVendorChannels] = useState([]);
  const [actionModal, setActionModal] = useState({
    isOpen: false,
    type: null, // 'approve', 'reject'
    vendorId: null,
    vendorName: null,
    documentLabel: null,
    documentUrl: null,
  });
  const [rejectReason, setRejectReason] = useState("");

  const getRegistrationDocument = (vendor) => {
    if (vendor?.documents?.tradeLicense?.url) {
      return {
        label: "Trade Licence",
        url: vendor.documents.tradeLicense.url,
      };
    }

    if (vendor?.documents?.gst) {
      return {
        label: "GST",
        url: vendor.documents.gst,
      };
    }

    if (vendor?.documents?.msme) {
      return {
        label: "MSME",
        url: vendor.documents.msme,
      };
    }

    if (vendor?.documents?.uin || vendor?.documents?.enrolmentId) {
      return {
        label: "Enrolment ID/UIN",
        url: vendor.documents.uin || vendor.documents.enrolmentId,
      };
    }

    return null;
  };

  const pendingVendors = useMemo(() => {
    let filtered = vendors.filter((v) => v.status === "pending");

    if (searchQuery) {
      filtered = filtered.filter(
        (vendor) =>
          vendor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.storeName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [vendors, searchQuery]);

  const pendingChannelVendors = useMemo(() => {
    let filtered = vendors.filter(
      (v) =>
        v.status !== "pending" &&
        Object.values(v.channels || {}).some((c) => c?.status === "requested")
    );

    if (searchQuery) {
      filtered = filtered.filter(
        (vendor) =>
          vendor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.storeName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [vendors, searchQuery]);

  const accountPendingCount = useMemo(
    () => vendors.filter((v) => v.status === "pending").length,
    [vendors]
  );

  const channelPendingCount = useMemo(
    () =>
      vendors.filter(
        (v) =>
          v.status !== "pending" &&
          Object.values(v.channels || {}).some((c) => c?.status === "requested")
      ).length,
    [vendors]
  );

  const accountColumns = [
    {
      key: "id",
      label: "ID",
      sortable: true,
    },
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
            <span className="font-medium text-gray-800">
              {value || row.name}
            </span>
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
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">{value || "N/A"}</span>
      ),
    },
    {
      key: "joinDate",
      label: "Registration Date",
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              const document = getRegistrationDocument(row);
              setActionModal({
                isOpen: true,
                type: "approve",
                vendorId: row.id,
                vendorName: row.storeName || row.name,
                documentLabel: document?.label || null,
                documentUrl: document?.url || null,
              });
              const requested = [
                row.channels?.retail?.status === 'requested' && 'retail',
                row.channels?.wholesale?.status === 'requested' && 'wholesale',
                row.channels?.quickCommerce?.status === 'requested' && 'quick_commerce',
              ].filter(Boolean);
              setSelectedVendorChannels(requested.length ? requested : [row.vendorType || 'retail']);
            }}
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Approve Vendor">
            <FiCheckCircle />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const document = getRegistrationDocument(row);
              setActionModal({
                isOpen: true,
                type: "reject",
                vendorId: row.id,
                vendorName: row.storeName || row.name,
                documentLabel: document?.label || null,
                documentUrl: document?.url || null,
              });
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Reject Vendor">
            <FiXCircle />
          </button>
        </div>
      ),
    },
  ];

  const channelColumns = [
    {
      key: "id",
      label: "ID",
      sortable: true,
    },
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
            <span className="font-medium text-gray-800">
              {value || row.name}
            </span>
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
      key: "requestedChannels",
      label: "Requested Channels",
      sortable: false,
      render: (_, row) => {
        const requested = [
          row.channels?.retail?.status === 'requested' && { key: 'retail', label: 'Retail Marketplace' },
          row.channels?.wholesale?.status === 'requested' && { key: 'wholesale', label: 'Wholesale Marketplace' },
          row.channels?.quickCommerce?.status === 'requested' && { key: 'quick_commerce', label: 'Quick Commerce' },
        ].filter(Boolean);

        return (
          <div className="flex flex-wrap gap-1.5">
            {requested.map((ch) => (
              <span
                key={ch.key}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                {ch.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Account Status",
      sortable: true,
      render: (value) => (
        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full bg-green-50 text-green-700 border border-green-200 uppercase">
          {value || 'ACTIVE'}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/vendors/${row.id}?tab=channels`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 rounded-lg text-xs font-semibold transition-colors"
            title="Review Channels">
            <FiEye />
            Review Channels
          </button>
        </div>
      ),
    },
  ];

  const handleApprove = async () => {
    if (!selectedVendorChannels.length) {
      toast.error('Please select at least one channel before approving.');
      return;
    }
    const success = await updateVendorStatus(actionModal.vendorId, "approved", '', null, selectedVendorChannels);
    if (success) {
      toast.success("Vendor approved successfully");
      setActionModal({ isOpen: false, type: null, vendorId: null, vendorName: null, documentLabel: null, documentUrl: null });
      setSelectedVendorChannels([]);
    } else {
      toast.error("Failed to approve vendor");
    }
  };

  const handleReject = async () => {
    const success = await updateVendorStatus(
      actionModal.vendorId,
      "rejected",
      rejectReason.trim()
    );
    if (success) {
      toast.success("Vendor registration rejected");
      setActionModal({
        isOpen: false,
        type: null,
        vendorId: null,
        vendorName: null,
        documentLabel: null,
        documentUrl: null,
      });
      setRejectReason("");
    } else {
      toast.error("Failed to reject vendor");
    }
  };

  const getModalContent = () => {
    const renderDocumentLink = () => {
      if (!actionModal.documentUrl) return null;
      const url = getImageUrl(actionModal.documentUrl);
      return (
        <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
          <span className="text-sm font-semibold text-gray-800">{actionModal.documentLabel || "Document"} Provided</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-primary-600 font-medium hover:bg-primary-50 transition-colors shadow-sm">View Document</a>
        </div>
      );
    };
    if (actionModal.type === "approve") {
      return {
        title: "Approve Vendor?",
        message: `Approve only the channels whose documents and readiness checks have passed. Channels remain independent after approval.`,
        confirmText: "Approve",
        onConfirm: handleApprove,
        type: "success",
        customContent: (
          <div className="mt-4 space-y-4">
            {renderDocumentLink()}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Approved channels <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(VENDOR_TYPE_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex flex-col items-center justify-center p-3 border-2 rounded-xl cursor-pointer transition-all text-center ${
                      selectedVendorChannels.includes(value)
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}>
                    <input
                      type="checkbox"
                      name="vendorChannels"
                      value={value}
                      checked={selectedVendorChannels.includes(value)}
                      onChange={() => setSelectedVendorChannels((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])}
                      className="sr-only"
                    />
                    <span className="font-semibold text-sm">{label}</span>
                  </label>
                ))}
              </div>
              {!selectedVendorChannels.length && (
                <p className="text-xs text-red-500 mt-1">At least one channel is required.</p>
              )}
            </div>
          </div>
        )
      };
    } else if (actionModal.type === "reject") {
        return {
          title: "Reject Vendor Registration?",
          message: `Are you sure you want to reject "${actionModal.vendorName}"? This action cannot be undone.`,
          confirmText: "Reject",
          onConfirm: handleReject,
          type: "danger",
          customContent: (
            <div className="mt-4 space-y-4">
              {renderDocumentLink()}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                Rejection Reason (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Provide a reason for rejection..."
              />
              </div>
            </div>
          ),
        };
    }
    return null;
  };

  const modalContent = getModalContent();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Pending Approvals
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Review and approve pending vendor registrations and channel applications
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Sub-tabs for Account Registrations vs Channel Requests */}
        <div className="flex items-center gap-2 border-b border-gray-200 mb-6 pb-2">
          <button
            type="button"
            onClick={() => setActiveApprovalTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeApprovalTab === 'accounts'
                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}>
            <span>Account Registrations</span>
            {accountPendingCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                activeApprovalTab === 'accounts' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {accountPendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveApprovalTab('channels')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeApprovalTab === 'channels'
                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}>
            <FiGrid className="text-xs" />
            <span>Channel Requests</span>
            {channelPendingCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                activeApprovalTab === 'channels' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {channelPendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeApprovalTab === 'accounts'
                  ? 'Search pending vendor registrations...'
                  : 'Search pending channel applications...'
              }
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>
        </div>

        {/* DataTable */}
        {activeApprovalTab === 'accounts' ? (
          pendingVendors.length > 0 ? (
            <DataTable
              data={pendingVendors}
              columns={accountColumns}
              pagination={true}
              itemsPerPage={10}
              onRowClick={(row) => navigate(`/admin/vendors/${row.id}`)}
            />
          ) : (
            <div className="text-center py-12">
              <FiCheckCircle className="text-4xl text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No pending registrations</p>
              <p className="text-sm text-gray-400">
                All vendor account registrations have been reviewed
              </p>
            </div>
          )
        ) : (
          pendingChannelVendors.length > 0 ? (
            <DataTable
              data={pendingChannelVendors}
              columns={channelColumns}
              pagination={true}
              itemsPerPage={10}
              onRowClick={(row) => navigate(`/admin/vendors/${row.id}?tab=channels`)}
            />
          ) : (
            <div className="text-center py-12">
              <FiCheckCircle className="text-4xl text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No pending channel applications</p>
              <p className="text-sm text-gray-400">
                All vendor selling channel requests have been reviewed
              </p>
            </div>
          )
        )}
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
              documentLabel: null,
              documentUrl: null,
            });
            setRejectReason("");
          }}
          onConfirm={modalContent.onConfirm}
          title={modalContent.title}
          message={modalContent.message}
          confirmText={modalContent.confirmText}
          cancelText="Cancel"
          type={modalContent.type}
          customContent={modalContent.customContent}
        />
      )}
    </motion.div>
  );
};

export default PendingApprovals;
