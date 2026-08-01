import { useEffect } from "react";
import { motion } from "framer-motion";
import { FiBell, FiCheck, FiTrash2, FiInbox, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import PageTransition from "../../../shared/components/PageTransition";
import { useDeliveryNotificationStore } from "../store/deliveryNotificationStore";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const DeliveryNotifications = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    page,
    hasMore,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useDeliveryNotificationStore();

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const handleNotificationClick = (notification) => {
    const data = notification?.data || {};
    const orderId = String(data?.orderId || "").trim();
    if (orderId) {
      navigate(`/delivery/orders/${orderId}`);
      return;
    }
  };

  return (
    <PageTransition>
      <div className="space-y-6 select-none max-w-4xl mx-auto">
        {/* Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/90 backdrop-blur-xl border border-amber-500/20 p-6 rounded-3xl shadow-xl"
        >
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Notifications</h1>
            <p className="text-xs text-slate-400 mt-1">
              You have <strong className="text-amber-400">{unreadCount}</strong> unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => fetchNotifications(1)}
              className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-slate-300 hover:text-white hover:border-amber-500/40 text-xs font-bold transition-all flex items-center gap-1.5"
              type="button"
            >
              <FiRefreshCw className="text-xs" />
              <span>Refresh</span>
            </button>
            <button
              onClick={markAllAsRead}
              disabled={!notifications.length || unreadCount === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-extrabold text-xs shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:from-amber-400 hover:to-amber-500 transition-all"
              type="button"
            >
              Mark All Read
            </button>
          </div>
        </motion.div>

        {/* Notifications List */}
        {isLoading && notifications.length === 0 ? (
          <div className="bg-slate-800/90 rounded-3xl p-12 text-center border border-slate-700/80 text-slate-400 text-sm font-semibold">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-slate-800/90 rounded-3xl p-12 text-center border border-slate-700/80 shadow-xl">
            <FiInbox className="mx-auto mb-3 text-5xl text-amber-500/40" />
            <p className="text-slate-200 font-bold text-base">No notifications yet</p>
            <p className="text-xs text-slate-400 mt-1">
              New delivery task alerts and updates will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification, idx) => (
              <motion.div
                key={notification?._id || `${idx}-${notification?.createdAt || ""}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => handleNotificationClick(notification)}
                className={`rounded-2xl p-4 shadow-lg border transition-all duration-200 ${
                  notification?.isRead
                    ? "bg-slate-800/80 border-slate-700/60"
                    : "bg-slate-800 border-amber-500/40 shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                } ${
                  notification?.data?.orderId ? "cursor-pointer hover:border-amber-400" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <FiBell className={notification?.isRead ? "text-slate-400 text-sm" : "text-amber-400 text-sm"} />
                      <h3 className={`font-bold text-sm truncate ${notification?.isRead ? "text-slate-200" : "text-white"}`}>
                        {notification?.title || "Notification"}
                      </h3>
                      {!notification?.isRead && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed break-words">
                      {notification?.message || "-"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium">
                      {formatDateTime(notification?.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!notification?.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification?._id);
                        }}
                        className="p-2 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                        title="Mark as read"
                        type="button"
                      >
                        <FiCheck className="text-xs" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(notification?._id);
                      }}
                      className="p-2 rounded-xl bg-slate-950/80 border border-slate-700 text-red-400 hover:text-red-300 hover:border-red-500/40 transition-colors"
                      title="Delete notification"
                      type="button"
                    >
                      <FiTrash2 className="text-xs" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {hasMore && notifications.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => fetchNotifications(Number(page || 1) + 1)}
              disabled={isLoading}
              className="w-full py-3 rounded-2xl bg-slate-800/90 border border-slate-700 hover:border-amber-500/40 text-slate-200 font-bold text-xs uppercase tracking-wider disabled:opacity-50 transition-all"
              type="button"
            >
              {isLoading ? "Loading..." : "Load More Notifications"}
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default DeliveryNotifications;
