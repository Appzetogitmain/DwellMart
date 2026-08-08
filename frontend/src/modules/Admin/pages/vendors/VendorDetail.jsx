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
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorStore } from "../../store/vendorStore";
import { getAllOrders, getVendorCommissions, getVendorDocuments, updateVendorQuickCommerce } from "../../services/adminService";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import Badge from "../../../../shared/components/Badge";
import DataTable from "../../components/DataTable";
import { formatPrice } from "../../../../shared/utils/helpers";
import { VENDOR_TYPE_LABELS } from "../../../../shared/config/vendorCapabilities";
// import { formatDateTime } from '../../../utils/adminHelpers';
import toast from "react-hot-toast";

const VendorDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getVendor, updateVendorStatus, updateCommissionRate } =
    useVendorStore();
  const location = useLocation();
  const hideActions = new URLSearchParams(location.search).get("hideActions") === "true";

  const [vendor, setVendor] = useState(null);
  const [vendorOrders, setVendorOrders] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [additionalDocuments, setAdditionalDocuments] = useState([]);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;
  const [isSavingQuickCommerce, setIsSavingQuickCommerce] = useState(false);
  const [isEditingCommission, setIsEditingCommission] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  const isSameVendorId = (a, b) => String(a) === String(b);

  useEffect(() => {
    const fetchVendorData = async () => {
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
          toast.error("Failed to load vendor orders");
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
        toast.error("Vendor not found");
        navigate("/admin/vendors");
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
        label: "GST Document",
        url: getFullUrl(vendor.documents.gst),
        fileType: "document",
      }
    : null;

  const handleStatusUpdate = async (newStatus) => {
    const success = await updateVendorStatus(vendor.id, newStatus);
    if (success) {
      setVendor({ ...vendor, status: newStatus });
      toast.success(`Vendor status updated to ${newStatus}`);
    } else {
      toast.error("Failed to update vendor status");
    }
  };

  const vendorQuickCommerceEnabled = vendor?.sellingChannels?.quickCommerce?.enabled === true;

  const handleToggleQuickCommerce = async () => {
    const nextEnabled = !vendorQuickCommerceEnabled;
    setIsSavingQuickCommerce(true);
    try {
      const response = await updateVendorQuickCommerce(vendor.id, { enabled: nextEnabled });
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
          {!hideActions && vendor.status === "pending" && (
            <button
              onClick={() => handleStatusUpdate("approved")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">
              <FiCheckCircle />
              Approve
            </button>
          )}
          {!hideActions && vendor.status === "approved" && (
            <button
              onClick={() => handleStatusUpdate("suspended")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm">
              <FiXCircle />
              Suspend
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200">
          {["overview", "orders", "commissions", "settings"].map((tab) => (
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
                            <p className="font-semibold text-gray-900">{vendor.wholesaleProfile?.gstNumber || "Not Provided"}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Business Name</p>
                            <p className="font-semibold text-gray-900">{vendor.wholesaleProfile?.businessName || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Wholesale Contact</p>
                            <p className="font-semibold text-gray-900">
                              {vendor.wholesaleProfile?.wholesaleContactName || "N/A"}
                              {vendor.wholesaleProfile?.wholesaleContactPhone ? ` (${vendor.wholesaleProfile.wholesaleContactPhone})` : ""}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Bulk Support Email</p>
                            <p className="font-semibold text-gray-900">{vendor.wholesaleProfile?.bulkOrderSupportEmail || "N/A"}</p>
                          </div>
                        </div>

                        {vendor.wholesaleProfile?.businessAddress && (
                          <div className="pt-2 border-t border-purple-100">
                            <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Registered Business Address</p>
                            <p className="font-medium text-gray-800 text-xs mt-0.5">
                              {vendor.wholesaleProfile.businessAddress.street || ""}
                              {vendor.wholesaleProfile.businessAddress.city && `, ${vendor.wholesaleProfile.businessAddress.city}`}
                              {vendor.wholesaleProfile.businessAddress.state && `, ${vendor.wholesaleProfile.businessAddress.state}`}
                              {vendor.wholesaleProfile.businessAddress.zipCode && ` ${vendor.wholesaleProfile.businessAddress.zipCode}`}
                              {vendor.wholesaleProfile.businessAddress.country && `, ${vendor.wholesaleProfile.businessAddress.country}`}
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
                      {vendorQuickCommerceEnabled
                        && !vendor.quickCommerceProfile?.location?.coordinates?.length && (
                        <p className="text-xs text-orange-600 mt-1">
                          No store location set — this vendor will not appear in any nearby search.
                        </p>
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
    </motion.div>
  );
};

export default VendorDetail;
