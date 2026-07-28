import { useState, useEffect, useMemo } from "react";
import { FiBell, FiSearch, FiCheck, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import DataTable from "../../Admin/components/DataTable";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorNotificationStore } from "../store/vendorNotificationStore";

const Notifications = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
    fetchNotifications,
  } = useVendorNotificationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (!vendorId) return;
    fetchNotifications(1);
  }, [vendorId, fetchNotifications]);

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    if (searchQuery) {
      filtered = filtered.filter(
        (notif) =>
          notif.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          notif.message?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((notif) => notif.type === typeFilter);
    }

    if (readFilter !== "all") {
      filtered = filtered.filter((notif) =>
        readFilter === "read" ? notif.isRead : !notif.isRead
      );
    }

    return filtered.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }, [notifications, searchQuery, typeFilter, readFilter]);

  const handleMarkRead = (id) => markAsRead(id);

  const handleMarkAllRead = () => markAllAsRead();

  const handleDelete = (id) => removeNotification(id);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getTypeLabel = (type) => {
    const typeMap = {
      order: "Order",
      payment: "Payment",
      promotion: "Promotion",
      system: "System",
    };
    return typeMap[type] || type;
  };

  const columns = [
    {
      key: "title",
      label: "Notification",
      sortable: true,
      render: (value, row) => (
        <div className={!row.isRead ? "font-semibold" : ""}>
          <p className="text-gray-800">{value}</p>
          <p className="text-sm text-gray-600 mt-1">{row.message}</p>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (value) => <Badge variant="info">{getTypeLabel(value)}</Badge>,
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleString()}
        </span>
      ),
    },
    {
      key: "isRead",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge variant={value ? "success" : "warning"}>
          {value ? "Read" : "Unread"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {!row.isRead && (
            <button
              onClick={() => handleMarkRead(row._id)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Mark as Read">
              <FiCheck />
            </button>
          )}
          <button
            onClick={() => handleDelete(row._id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete">
            <FiX />
          </button>
        </div>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view notifications</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
            <FiBell className="text-primary-600" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="warning" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage your order and system notifications
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold">
            <FiCheck />
            Mark All Read
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Total</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-800">
            {notifications.length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Unread</p>
          <p className="text-lg sm:text-2xl font-bold text-yellow-600">
            {unreadCount}
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Read</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600">
            {notifications.length - unreadCount}
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Orders</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-600">
            {
              notifications.filter(
                (n) => n.type === "order"
              ).length
            }
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>

          <AnimatedSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: "all", label: "All Types" },
              { value: "order", label: "Order" },
              { value: "payment", label: "Payment" },
              { value: "promotion", label: "Promotion" },
              { value: "system", label: "System" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <AnimatedSelect
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "read", label: "Read" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />
        </div>
      </div>

      {/* Notifications Table */}
      {filteredNotifications.length > 0 ? (
        <DataTable
          data={filteredNotifications}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
          onRowClick={(row) => {
            if (row.data?.returnRequestId) navigate("/vendor/return-requests");
            else if (row.data?.documentId) navigate("/vendor/profile?tab=documents");
            else if (row.orderId || row.data?.orderId)
              navigate("/vendor/orders/all-orders");
            if (!row.isRead) {
              handleMarkRead(row._id);
            }
          }}
        />
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">No notifications found</p>
        </div>
      )}
    </motion.div>
  );
};

export default Notifications;
