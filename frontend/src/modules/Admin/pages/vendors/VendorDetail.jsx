import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FiArrowLeft,
  FiMail,
  FiPhone,
  FiMapPin,
  FiShoppingBag,
  FiDollarSign,
  FiClock,
  FiEdit,
  FiPackage,
  FiCheckCircle,
  FiXCircle,
  FiTrendingUp,
  FiUser,
  FiFileText,
  FiTrash2,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorStore } from "../../store/vendorStore";
import { useAdminAuthStore } from "../../store/adminStore";
import { PERMISSIONS } from "../../config/permissions";
import ConfirmModal from "../../components/ConfirmModal";
import { getAllOrders, getVendorCommissions, getVendorDocuments, updateVendorQuickCommerce, updateVendorChannelStatus } from "../../services/adminService";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import Badge from "../../../../shared/components/Badge";
import DataTable from "../../components/DataTable";
import { formatPrice, getImageUrl } from "../../../../shared/utils/helpers";
import { VENDOR_TYPE_LABELS } from "../../../../shared/config/vendorCapabilities";
// import { formatDateTime } from '../../../utils/adminHelpers';
import toast from "react-hot-toast";

const VendorDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin, can } = useAdminAuthStore();
  const { getVendor, updateVendorStatus, updateCommissionRate, deleteVendor } =
    useVendorStore();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hideActions = searchParams.get("hideActions") === "true";
  const initialTab = searchParams.get("tab") || "overview";

  const [vendor, setVendor] = useState(null);
  const [vendorOrders, setVendorOrders] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [additionalDocuments, setAdditionalDocuments] = useState([]);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (tabParam && ["overview", "channels", "orders", "commissions", "settings"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;
  const [isSavingQuickCommerce, setIsSavingQuickCommerce] = useState(false);
  const [isEditingCommission, setIsEditingCommission] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [statusReason, setStatusReason] = useState("");
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const isSameVendorId = (a, b) => String(a) === String(b);

  useEffect(() => {
    const fetchVendorData = async () => {
      if (!id || id === "undefined" || id === "null" || !/^[a-fA-F0-9]{24}$/.test(String(id).trim())) {
        navigate("/admin/vendors/pending-approvals?type=channels");
        return;
      }

      // 1. Fetch Vendor Details
      const data = await getVendor(id);
      if (data) {
        setVendor(data);
        setCommissionRate(((data.commissionRate || 0) * 100).toFixed(1));

        // 2. Fetch Vendor Orders (all pages)
        try {
          const fetchedOrders = [];
          let page = 1;
          let pages = 1;
          do {
            const ordersResponse = await getAllOrders({
              vendorId: id,
              page,
              limit: 200,
            });
            const payload = ordersResponse?.data ?? ordersResponse;
            const orderPage = Array.isArray(payload?.orders) ? payload.orders : [];
            fetchedOrders.push(...orderPage);
            pages = Math.max(Number(payload?.pages) || 1, 1);
            page += 1;
          } while (page <= pages);

          const normalizedOrders = fetchedOrders.map((order) => ({
            ...order,
            id: order.orderId || order._id,
            date: order.date || order.createdAt,
          }));
          setVendorOrders(normalizedOrders);
        } catch (error) {
          console.error("Failed to fetch vendor orders:", error);
        }

        // 3. Fetch vendor commissions for commissions tab + earnings summary
        try {
          const fetchedCommissions = [];
          let page = 1;
          let pages = 1;
          do {
            const response = await getVendorCommissions(id, { page, limit: 200 });
            const payload = response?.data ?? response;
            const pageCommissions = Array.isArray(payload?.commissions)
              ? payload.commissions
              : [];
            fetchedCommissions.push(...pageCommissions);
            pages = Math.max(Number(payload?.pages) || 1, 1);
            page += 1;
          } while (page <= pages);
          setCommissions(fetchedCommissions);
        } catch {
          setCommissions([]);
        }

        // 4. Fetch Additional Vendor Documents
        try {
          const docsRes = await getVendorDocuments(id);
          const docs = docsRes?.data ?? docsRes ?? [];
          setAdditionalDocuments(Array.isArray(docs) ? docs : []);
        } catch (error) {
          console.error("Failed to fetch additional documents:", error);
          setAdditionalDocuments([]);
        }
      } else {
        navigate("/admin/vendors/pending-approvals?type=channels");
      }
    };
    fetchVendorData();
  }, [id, getVendor, navigate]);

  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  useEffect(() => {
    if (!vendor) return;

    const summary = commissions.reduce(
      (acc, row) => {
        const earnings = Number(row.vendorEarnings || 0);
        acc.totalEarnings += earnings;
        if (row.status === "pending") acc.pendingEarnings += earnings;
        return acc;
      },
      { totalEarnings: 0, pendingEarnings: 0 }
    );

    setEarningsSummary(summary);
  }, [vendor, commissions]);

  const getFullUrl = (url) => {
    return getImageUrl(url);
  };

  const registrationDocument = vendor?.documents?.tradeLicense?.url
    ? {
        label: "Trade Licence",
        url: getFullUrl(vendor.documents.tradeLicense.url),
        fileType: vendor.documents.tradeLicense.fileType || "document",
      }
    : vendor?.documents?.gst
    ? {
        label: "GST",
        url: getFullUrl(vendor.documents.gst),
        fileType: "document",
      }
    : vendor?.documents?.msme
    ? {
        label: "MSME",
        url: getFullUrl(vendor.documents.msme),
        fileType: "document",
      }
    : (vendor?.documents?.uin || vendor?.documents?.enrolmentId)
    ? {
        label: "Enrolment ID/UIN",
        url: getFullUrl(vendor.documents.uin || vendor.documents.enrolmentId),
        fileType: "document",
      }
    : null;

  // Per-channel approval: the admin decides which requested channels to grant.
  // Approval used to send every requested channel with no way to approve a
  // subset, and any channel not granted stayed 'requested' forever.
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [approvalSelection, setApprovalSelection] = useState([]);

  const requestedChannelList = ['retail', 'wholesale', 'quick_commerce'].filter((channel) => {
    const path = channel === 'quick_commerce' ? 'quickCommerce' : channel;
    return vendor?.channels?.[path]?.status === 'requested';
  });

  const openApprovalDialog = () => {
    setApprovalSelection(requestedChannelList);
    setIsApprovalOpen(true);
  };

  const toggleApprovalChannel = (channel) => {
    setApprovalSelection((current) => (
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel]
    ));
  };

  const handleStatusUpdate = async (newStatus, approvedChannelsOverride = null) => {
    const isReactivation = vendor.status === 'suspended' && newStatus === 'approved';
    let selected = null;
    if (newStatus === 'approved') {
      if (isReactivation) {
        selected = approvedChannelsOverride ?? null;
      } else {
        const requestedChannels = [
          vendor.channels?.retail?.status === 'requested' && 'retail',
          vendor.channels?.wholesale?.status === 'requested' && 'wholesale',
          vendor.channels?.quickCommerce?.status === 'requested' && 'quick_commerce',
        ].filter(Boolean);
        selected = approvedChannelsOverride ?? requestedChannels;
      }
    }
    const success = await updateVendorStatus(
      vendor.id, newStatus, statusReason.trim(), null,
      selected?.length ? selected : (newStatus === 'approved' && !isReactivation ? [vendor.vendorType || 'retail'] : null)
    );
    if (success) {
      const refreshed = await getVendor(vendor.id);
      if (refreshed) {
        setVendor(refreshed);
      } else {
        setVendor({ ...vendor, status: newStatus });
      }
      setShowSuspendModal(false);
      setShowActivateModal(false);
      setStatusReason("");
      toast.success(isReactivation ? 'Vendor activated successfully' : `Vendor status updated to ${newStatus}`);
    } else {
      toast.error("Failed to update vendor status");
    }
  };

  const handleHardDelete = async () => {
    if (deleteConfirmationInput !== "DELETE") {
      toast.error("Please type DELETE to confirm permanent deletion");
      return;
    }
    setIsDeleting(true);
    try {
      await deleteVendor(vendor.id);
      toast.success("Vendor permanently deleted");
      setShowDeleteModal(false);
      navigate("/admin/vendors/manage-vendors");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to delete vendor");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleChannelStatus = async (channel, status) => {
    const reason = ['rejected', 'paused', 'disabled'].includes(status)
      ? (window.prompt(`Reason for ${status} (optional):`) || '')
      : '';
    try {
      const response = await updateVendorChannelStatus(vendor.id, channel, {
        status, reason, expectedRevision: vendor.channelsRevision,
      });
      setVendor(response?.data || response);
      toast.success(`${channel.replace('_', ' ')} is now ${status}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Channel update failed');
    }
  };

  const vendorQuickCommerceEnabled = vendor?.channels?.quickCommerce?.status === 'active';

  const handleToggleQuickCommerce = async () => {
    const nextEnabled = !vendorQuickCommerceEnabled;
    setIsSavingQuickCommerce(true);
    try {
      // expectedRevision is mandatory server-side: omitting it used to skip the
      // concurrency check entirely, letting two admins clobber each other.
      const response = await updateVendorQuickCommerce(vendor.id, {
        enabled: nextEnabled,
        expectedRevision: vendor.channelsRevision,
      });
      const data = response?.data ?? response;
      setVendor((prev) => ({
        ...prev,
        sellingChannels: data?.sellingChannels ?? prev.sellingChannels,
        quickCommerceProfile: data?.quickCommerceProfile ?? prev.quickCommerceProfile,
      }));
      toast.success(nextEnabled ? "Quick Commerce enabled for vendor" : "Quick Commerce disabled for vendor");
    } catch {
      // api.js surfaces the error toast
    } finally {
      setIsSavingQuickCommerce(false);
    }
  };

  const handleCommissionUpdate = async () => {
    const rate = parseFloat(commissionRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast.error("Please enter a valid commission rate (0-100%)");
      return;
    }
    const success = await updateCommissionRate(vendor.id, rate);
    if (success) {
      setVendor({ ...vendor, commissionRate: rate });
      setIsEditingCommission(false);
      toast.success("Commission rate updated successfully");
    } else {
      toast.error("Failed to update commission rate");
    }
  };

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const orderColumns = [
    {
      key: "id",
      label: "Order ID",
      sortable: true,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "delivered"
              ? "success"
              : value === "pending"
                ? "warning"
                : value === "cancelled" || value === "canceled"
                  ? "error"
                  : "info"
          }>
          {value?.toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "total",
      label: "Amount",
      sortable: true,
      render: (_, row) => {
        const vendorItem = row.vendorItems?.find(
          (vi) => isSameVendorId(vi.vendorId, vendor.id)
        );
        return formatPrice(vendorItem?.subtotal || 0);
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => navigate(`/admin/orders/${row.id}`)}
          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          View
        </button>
      ),
    },
  ];

  const commissionColumns = [
    {
      key: "orderId",
      label: "Order ID",
      sortable: true,
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: "subtotal",
      label: "Subtotal",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "commission",
      label: "Commission",
      sortable: true,
      render: (value) => (
        <span className="text-red-600">-{formatPrice(value)}</span>
      ),
    },
    {
      key: "vendorEarnings",
      label: "Vendor Earnings",
      sortable: true,
      render: (value) => (
        <span className="text-green-600">{formatPrice(value)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "paid"
              ? "success"
              : value === "pending"
                ? "warning"
                : "error"
          }>
          {value?.toUpperCase()}
        </Badge>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
              {vendor.storeName || vendor.name}
            </h1>
            <p className="text-xs text-gray-500">Vendor ID: {vendor.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">
            {VENDOR_TYPE_LABELS[vendor.vendorType] ?? (vendor.vendorType?.toUpperCase() || "RETAIL")}
          </Badge>
          <Badge
            variant={
              vendor.status === "approved"
                ? "success"
                : vendor.status === "pending"
                  ? "warning"
                  : "error"
            }>
            {vendor.status?.toUpperCase()}
          </Badge>
          {!hideActions && vendor.status === "pending" && (admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_APPROVE)) && (
            <button
              onClick={openApprovalDialog}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
              <FiCheckCircle />
              Approve
            </button>
          )}
          {!hideActions && vendor.status === "approved" && (admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_APPROVE)) && (
            <button
              onClick={() => {
                setStatusReason("");
                setShowSuspendModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
              <FiXCircle />
              Suspend
            </button>
          )}
          {!hideActions && vendor.status === "suspended" && (admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_APPROVE)) && (
            <button
              onClick={() => setShowActivateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium">
              <FiCheckCircle />
              Activate Vendor
            </button>
          )}
          {!hideActions && (admin?.role === "superadmin" || can(PERMISSIONS.VENDORS_DELETE)) && (
            <button
              onClick={() => {
                setDeleteConfirmationInput("");
                setShowDeleteModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium"
              title="Permanently Delete Test Vendor">
              <FiTrash2 />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200">
          {["overview", "channels", "orders", "commissions", "settings"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-semibold text-sm transition-colors ${
                activeTab === tab
                  ? "text-primary-600 border-b-2 border-primary-600"
                  : "text-gray-600 hover:text-gray-800"
              }`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "channels" && (
            <div className="space-y-4">
              <div><h2 className="text-lg font-bold text-gray-800">Channel approvals</h2><p className="text-sm text-gray-500">Each transition is independent and revision-protected.</p></div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ['retail', 'retail', 'Retail Marketplace'],
                  ['wholesale', 'wholesale', 'Wholesale Marketplace'],
                  ['quick_commerce', 'quickCommerce', 'Quick Commerce'],
                ].map(([channel, path, label]) => {
                  const state = vendor.channels?.[path] || { status: 'disabled' };
                  return <article key={channel} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-900">{label}</h3><Badge variant={state.status === 'active' ? 'success' : state.status === 'requested' ? 'warning' : 'neutral'}>{state.status}</Badge></div>
                    {state.reason && <p className="mt-2 text-xs text-red-600">{state.reason}</p>}
                    {!hideActions && vendor.status === 'approved' && <div className="mt-4 flex flex-wrap gap-2">
                      {['requested', 'paused'].includes(state.status) && <button onClick={() => handleChannelStatus(channel, 'active')} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Activate</button>}
                      {state.status === 'active' && <button onClick={() => handleChannelStatus(channel, 'paused')} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">Pause</button>}
                      {state.status === 'requested' && <button onClick={() => handleChannelStatus(channel, 'rejected')} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Reject</button>}
                      {state.status === 'paused' && <button onClick={() => handleChannelStatus(channel, 'disabled')} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">Disable</button>}
                    </div>}
                  </article>;
                })}
              </div>
            </div>
          )}
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Vendor Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Vendor Information
                  </h2>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <FiUser className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Name</p>
                        <p className="font-semibold text-gray-800">
                          {vendor.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiMail className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Email</p>
                        <p className="font-semibold text-gray-800">
                          {vendor.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiPhone className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Phone</p>
                        <p className="font-semibold text-gray-800">
                          {vendor.phone || "N/A"}
                        </p>
                      </div>
                    </div>
                    {vendor.address && (
                      <div className="flex items-start gap-3">
                        <FiMapPin className="text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-600">Address</p>
                          <p className="font-semibold text-gray-800">
                            {vendor.address.street || ""}
                            {vendor.address.city && `, ${vendor.address.city}`}
                            {vendor.address.state &&
                              `, ${vendor.address.state}`}
                            {vendor.address.zipCode &&
                              ` ${vendor.address.zipCode}`}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <FiClock className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Join Date</p>
                        <p className="font-semibold text-gray-800">
                          {new Date(vendor.joinDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {vendor.bankDetails && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Bank Details</h3>
                      <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200/60 space-y-2">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider">Account Holder</p>
                            <p className="font-medium text-gray-800">{vendor.bankDetails.accountName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider">Account Number</p>
                            <p className="font-medium text-gray-800">{vendor.bankDetails.accountNumber || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider">Bank Name</p>
                            <p className="font-medium text-gray-800">{vendor.bankDetails.bankName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider">IFSC Code</p>
                            <p className="font-medium text-gray-800">{vendor.bankDetails.ifscCode || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Wholesale Profile & B2B Capabilities */}
                  {(vendor.sellingChannels?.wholesale?.enabled || vendor.wholesaleProfile) && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                          <FiPackage className="text-purple-600" /> Wholesale Profile &amp; B2B Capabilities
                        </h3>
                        <Badge
                          variant={
                            vendor.sellingChannels?.wholesale?.enabled ? "success" : "neutral"
                          }>
                          {vendor.sellingChannels?.wholesale?.enabled
                            ? "Wholesale Enabled"
                            : "Not Enabled"}
                        </Badge>
                      </div>

                      <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">GST Number</p>
                            <p className="font-semibold text-gray-900">
                              {vendor.wholesaleProfile?.gstNumber || vendor.documents?.gstNumber || vendor.documents?.gst || (registrationDocument?.url ? "Provided via Registration Document" : "Not Provided")}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Business Name</p>
                            <p className="font-semibold text-gray-900">{vendor.wholesaleProfile?.businessName || vendor.storeName || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Wholesale Contact</p>
                            <p className="font-semibold text-gray-900">
                              {vendor.wholesaleProfile?.wholesaleContactName || vendor.name || "N/A"}
                              {(vendor.wholesaleProfile?.wholesaleContactPhone || vendor.phone) ? ` (${vendor.wholesaleProfile?.wholesaleContactPhone || vendor.phone})` : ""}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Bulk Support Email</p>
                            <p className="font-semibold text-gray-900">{vendor.wholesaleProfile?.bulkOrderSupportEmail || vendor.email || "N/A"}</p>
                          </div>
                        </div>

                        {(vendor.wholesaleProfile?.businessAddress?.street || vendor.address) && (
                          <div className="pt-2 border-t border-purple-100">
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Registered Business Address</p>
                            <p className="font-medium text-gray-800 text-xs mt-0.5">
                              {vendor.wholesaleProfile?.businessAddress?.street
                                ? `${vendor.wholesaleProfile.businessAddress.street}${vendor.wholesaleProfile.businessAddress.city ? `, ${vendor.wholesaleProfile.businessAddress.city}` : ''}${vendor.wholesaleProfile.businessAddress.state ? `, ${vendor.wholesaleProfile.businessAddress.state}` : ''}${vendor.wholesaleProfile.businessAddress.zipCode ? ` ${vendor.wholesaleProfile.businessAddress.zipCode}` : ''}${vendor.wholesaleProfile.businessAddress.country ? `, ${vendor.wholesaleProfile.businessAddress.country}` : ''}`
                                : `${vendor.address?.street || ""}${vendor.address?.city ? `, ${vendor.address.city}` : ""}${vendor.address?.state ? `, ${vendor.address.state}` : ""}${vendor.address?.zipCode ? ` ${vendor.address.zipCode}` : ""}`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {registrationDocument?.url && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Registration Documents</h3>
                      <div className="flex justify-between items-center bg-gray-50/80 p-3 rounded-xl border border-gray-200/60">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm text-primary-500">
                            <FiFileText className="text-lg" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{registrationDocument.label}</p>
                            <p className="text-xs text-gray-500 uppercase">{registrationDocument.fileType}</p>
                          </div>
                        </div>
                        <a 
                          href={registrationDocument.url}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 focus:ring-2 focus:ring-primary-500/20 transition-all shadow-sm"
                        >
                          View File
                        </a>
                      </div>
                    </div>
                  )}

                  {additionalDocuments.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Additional Uploads</h3>
                      <div className="space-y-3">
                        {additionalDocuments.map((doc) => (
                          <div key={doc._id} className="flex justify-between items-center bg-gray-50/80 p-3 rounded-xl border border-gray-200/60">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm text-primary-500">
                                <FiFileText className="text-lg" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{doc.title || "Vendor Document"}</p>
                                <p className="text-xs text-gray-500 uppercase">{doc.fileType || "document"}</p>
                              </div>
                            </div>
                            <a 
                              href={getFullUrl(doc.fileUrl)}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 focus:ring-2 focus:ring-primary-500/20 transition-all shadow-sm"
                            >
                              View File
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Performance Stats */}
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Performance
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs text-blue-600 mb-1">Total Orders</p>
                      <p className="text-2xl font-bold text-blue-800">
                        {vendorOrders.length}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs text-green-600 mb-1">
                        Total Earnings
                      </p>
                      <p className="text-2xl font-bold text-green-800">
                        {earningsSummary
                          ? formatPrice(earningsSummary.totalEarnings)
                          : formatPrice(0)}
                      </p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-xs text-yellow-600 mb-1">
                        Pending Earnings
                      </p>
                      <p className="text-2xl font-bold text-yellow-800">
                        {earningsSummary
                          ? formatPrice(earningsSummary.pendingEarnings)
                          : formatPrice(0)}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-xs text-purple-600 mb-1">
                        Commission Rate
                      </p>
                      <p className="text-2xl font-bold text-purple-800">
                        {((vendor.commissionRate || 0) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Vendor Orders
              </h2>
              {vendorOrders.length > 0 ? (
                <DataTable
                  data={vendorOrders}
                  columns={orderColumns}
                  pagination={true}
                  itemsPerPage={10}
                />
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No orders found
                </p>
              )}
            </div>
          )}

          {/* Commissions Tab */}
          {activeTab === "commissions" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Commission History
              </h2>
              {commissions.length > 0 ? (
                <DataTable
                  data={commissions}
                  columns={commissionColumns}
                  pagination={true}
                  itemsPerPage={10}
                />
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No commission records found
                </p>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              {/* Quick Commerce capability — only when the platform feature is on */}
              {quickCommerceEnabled && (
                <div className="pb-6 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-800 mb-1">Quick Commerce</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Grant or revoke this vendor's access to the Quick Commerce experience.
                  </p>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {vendorQuickCommerceEnabled ? "Enabled" : "Disabled"}
                      </p>
                      <p className="text-xs text-gray-600">
                        {vendorQuickCommerceEnabled
                          ? `${vendor.quickCommerceProfile?.serviceRadiusKm ?? 5} km radius · ${vendor.quickCommerceProfile?.preparationTimeMins ?? 10} min prep`
                          : "Vendor cannot list Quick Commerce products."}
                      </p>
                      {vendorQuickCommerceEnabled && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                          <p className="text-xs font-semibold text-gray-700">
                            Fulfillment Location: <span className="font-normal text-gray-800">{vendor.quickCommerceProfile?.locationAddress || "No text address set"}</span>
                          </p>
                          {vendor.quickCommerceProfile?.location?.coordinates?.length === 2 ? (
                            <p className="text-xs font-mono text-emerald-700 bg-emerald-50 inline-block px-2 py-0.5 rounded border border-emerald-200">
                              Pin: {vendor.quickCommerceProfile.location.coordinates[1]?.toFixed(6)}, {vendor.quickCommerceProfile.location.coordinates[0]?.toFixed(6)}
                            </p>
                          ) : (
                            <p className="text-xs text-orange-600 font-semibold mt-1">
                              ⚠️ No store map pin set — this vendor will not appear in nearby searches.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleQuickCommerce}
                      disabled={isSavingQuickCommerce}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                        vendorQuickCommerceEnabled
                          ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                          : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                      }`}
                    >
                      {isSavingQuickCommerce
                        ? "Saving..."
                        : vendorQuickCommerceEnabled
                          ? "Disable Quick Commerce"
                          : "Enable Quick Commerce"}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  Commission Rate
                </h2>
                <div className="flex items-center gap-4">
                  {isEditingCommission ? (
                    <>
                      <input
                        type="number"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        min="0"
                        max="100"
                        step="0.1"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-32"
                        placeholder="10.0"
                      />
                      <button
                        onClick={handleCommissionUpdate}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingCommission(false);
                          setCommissionRate(
                            ((vendor.commissionRate || 0) * 100).toFixed(1)
                          );
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-gray-800">
                        {((vendor.commissionRate || 0) * 100).toFixed(1)}%
                      </p>
                      <button
                        onClick={() => setIsEditingCommission(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2">
                        <FiEdit />
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isApprovalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Approve vendor account</h3>
            <p className="mt-1 text-sm text-gray-600">
              Choose which requested channels to approve. Any requested channel left
              unchecked will be rejected and the vendor notified.
            </p>

            <div className="mt-4 space-y-2">
              {requestedChannelList.length === 0 && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  This vendor has no pending channel requests. Approve the account, then
                  activate a channel from Channel Management.
                </p>
              )}
              {requestedChannelList.map((channel) => (
                <label key={channel} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={approvalSelection.includes(channel)}
                    onChange={() => toggleApprovalChannel(channel)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium text-gray-900 capitalize">
                    {channel.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setIsApprovalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={requestedChannelList.length > 0 && approvalSelection.length === 0}
                onClick={async () => {
                  setIsApprovalOpen(false);
                  await handleStatusUpdate('approved', approvalSelection);
                }}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate Modal */}
      <ConfirmModal
        isOpen={showActivateModal}
        onClose={() => setShowActivateModal(false)}
        onConfirm={() => handleStatusUpdate("approved")}
        title="Activate Vendor?"
        message={`Are you sure you want to activate "${vendor?.storeName || vendor?.name}"? The vendor will be restored to approved status and allowed to operate on their configured selling channels.`}
        confirmText="Activate Vendor"
        type="success"
      />

      {/* Suspend Modal */}
      <ConfirmModal
        isOpen={showSuspendModal}
        onClose={() => {
          setShowSuspendModal(false);
          setStatusReason("");
        }}
        onConfirm={() => handleStatusUpdate("suspended")}
        title="Suspend Vendor?"
        message={`Are you sure you want to suspend "${vendor?.storeName || vendor?.name}"? They will not be able to access their vendor dashboard.`}
        confirmText="Suspend Vendor"
        type="danger"
        customContent={
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
        }
      />

      {/* Hard Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmationInput("");
        }}
        onConfirm={handleHardDelete}
        title="Permanently Delete Vendor?"
        message={`This will permanently remove "${vendor?.storeName || vendor?.name}" and all associated products, documents, and settings from the database. This action CANNOT be undone.`}
        confirmText="Permanently Delete"
        type="danger"
        isLoading={isDeleting}
        confirmDisabled={deleteConfirmationInput !== "DELETE"}
        customContent={
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
        }
      />
    </motion.div>
  );
};

export default VendorDetail;
