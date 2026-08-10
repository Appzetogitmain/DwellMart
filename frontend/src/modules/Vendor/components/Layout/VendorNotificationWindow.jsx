import { useEffect, useRef } from "react";
import { FiBell, FiCheck, FiX, FiChevronRight, FiTrash2 } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { formatDateTime } from "../../../Admin/utils/adminHelpers";
import { useVendorNotificationStore } from "../../store/vendorNotificationStore";
import { navigateToNotificationTarget } from "../../../../shared/utils/notificationNavigator";

const VendorNotificationWindow = ({ isOpen, onClose, position = "right" }) => {
  const navigate = useNavigate();
  const windowRef = useRef(null);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useVendorNotificationStore();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (windowRef.current && !windowRef.current.contains(event.target)) {
        if (!event.target.closest("[data-notification-button]")) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const getNotificationColor = (type) => {
    const colors = {
      order: "bg-blue-100 text-blue-600",
      payment: "bg-emerald-100 text-emerald-600",
      promotion: "bg-purple-100 text-purple-600",
      system: "bg-gray-100 text-gray-600",
    };
    return colors[type] || colors.system;
  };

  const handleNotificationClick = (notification) => {
    navigateToNotificationTarget(notification, navigate, "vendor", markAsRead);
    onClose();
  };

  const positionClasses = {
    right: "right-0",
    left: "left-0",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-[9999] lg:hidden"
          />

          <motion.div
            ref={windowRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed lg:absolute ${positionClasses[position]} top-[calc(4rem-40px)] lg:top-full lg:-mt-[38px] right-[11px] lg:-right-[5px] z-[10000] w-[calc(100vw-2rem)] sm:w-96 max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden`}
            style={{ willChange: "transform" }}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-800">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FiX className="text-lg" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-admin">
              {notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <FiBell className="mx-auto text-4xl text-gray-400 mb-4" />
                  <p className="text-gray-500 font-medium">No notifications</p>
                  <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification._id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.isRead ? "bg-blue-50/30" : ""
                        }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getNotificationColor(
                            notification.type
                          )}`}
                        >
                          <FiBell className="text-lg" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-800 text-sm">
                              {notification.title}
                            </h4>
                            {!notification.isRead && (
                              <span className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-gray-500">
                              {formatDateTime(notification.createdAt)}
                            </span>
                            {(notification.orderId || notification.data?.orderId) && (
                              <span className="text-xs font-medium text-primary-600">
                                {notification.orderId || notification.data?.orderId}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notification.isRead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification._id);
                              }}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Mark as read"
                            >
                              <FiCheck className="text-sm" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(notification._id);
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <FiTrash2 className="text-sm" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-3">
                <button
                  onClick={() => {
                    navigate("/vendor/notifications");
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <span>View all notifications</span>
                  <FiChevronRight className="text-base" />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default VendorNotificationWindow;

