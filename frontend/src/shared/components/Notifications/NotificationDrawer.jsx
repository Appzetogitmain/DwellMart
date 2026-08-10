import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    FiX,
    FiCheckCircle,
    FiTrash2,
    FiCheck,
    FiPackage,
    FiInfo,
    FiAlertTriangle,
    FiTruck,
    FiExternalLink,
    FiShoppingBag,
} from 'react-icons/fi';
import { useNotificationStore } from '../../store/useNotificationStore';
import { navigateToNotificationTarget } from '../../utils/notificationNavigator';

export const NotificationDrawer = () => {
    const navigate = useNavigate();
    const {
        notifications,
        unreadCount,
        isLoading,
        isDrawerOpen,
        activeTab,
        setDrawerOpen,
        setActiveTab,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
    } = useNotificationStore();

    useEffect(() => {
        if (isDrawerOpen) {
            fetchNotifications({ page: 1 });
        }
    }, [isDrawerOpen, fetchNotifications]);

    const getCategoryBadge = (category, type) => {
        const cat = String(category || type || '').toUpperCase();
        if (cat.includes('ORDER')) {
            return <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><FiShoppingBag className="w-5 h-5" /></div>;
        }
        if (cat.includes('DELIVERY')) {
            return <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"><FiTruck className="w-5 h-5" /></div>;
        }
        if (cat.includes('SUCCESS') || cat.includes('APPROVAL')) {
            return <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"><FiCheckCircle className="w-5 h-5" /></div>;
        }
        if (cat.includes('WARNING') || cat.includes('ERROR')) {
            return <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"><FiAlertTriangle className="w-5 h-5" /></div>;
        }
        return <div className="p-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"><FiInfo className="w-5 h-5" /></div>;
    };

    const handleActionClick = (notification) => {
        setDrawerOpen(false);
        navigateToNotificationTarget(notification, navigate, 'user', markAsRead);
    };

    const tabs = [
        { id: 'all', label: 'All' },
        { id: 'unread', label: `Unread (${unreadCount})` },
        { id: 'order', label: 'Orders' },
        { id: 'system', label: 'System' },
    ];

    return (
        <AnimatePresence>
            {isDrawerOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setDrawerOpen(false)}
                        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[999998]"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-[999999] flex flex-col border-l border-gray-200 dark:border-gray-800"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Notifications</h3>
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 text-xs font-semibold">
                                        {unreadCount} new
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setDrawerOpen(false)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                            >
                                <FiX className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Controls / Tabs */}
                        <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between gap-2 overflow-x-auto">
                            <div className="flex items-center gap-1">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                            activeTab === tab.id
                                                ? 'bg-primary-600 text-white shadow-sm'
                                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-1">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        title="Mark all as read"
                                        className="p-1.5 rounded-lg hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs flex items-center gap-1 font-medium"
                                    >
                                        <FiCheck className="w-4 h-4 text-emerald-500" />
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearAllNotifications}
                                        title="Clear all"
                                        className="p-1.5 rounded-lg hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 text-xs"
                                    >
                                        <FiTrash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notification Items List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mb-2" />
                                    <p className="text-xs">Loading notifications...</p>
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
                                    <FiPackage className="w-12 h-12 mb-3 stroke-[1.5] text-gray-300 dark:text-gray-700" />
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No notifications found</p>
                                    <p className="text-xs text-gray-400 mt-1">You are all caught up!</p>
                                </div>
                            ) : (
                                notifications.map((n) => (
                                    <motion.div
                                        key={n._id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        onClick={() => handleActionClick(n)}
                                        className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer ${
                                            !n.isRead
                                                ? 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40'
                                                : 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800 hover:border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {getCategoryBadge(n.category, n.type)}

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h4 className={`text-sm font-semibold truncate ${!n.isRead ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                                        {n.title}
                                                    </h4>
                                                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>

                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                                    {n.message || n.body}
                                                </p>

                                                {n.image && (
                                                    <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 max-h-32">
                                                        <img src={n.image} alt={n.title} className="w-full h-24 object-cover" />
                                                    </div>
                                                )}

                                                <div className="mt-2.5 flex items-center justify-between gap-2">
                                                    {n.actionUrl ? (
                                                        <button
                                                            onClick={() => handleActionClick(n)}
                                                            className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                                                        >
                                                            View details <FiExternalLink className="w-3 h-3" />
                                                        </button>
                                                    ) : <div />}

                                                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                        {!n.isRead && (
                                                            <button
                                                                onClick={() => markAsRead(n._id)}
                                                                title="Mark read"
                                                                className="p-1 rounded text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs"
                                                            >
                                                                <FiCheck className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => deleteNotification(n._id)}
                                                            title="Delete"
                                                            className="p-1 rounded text-gray-400 hover:text-red-500 text-xs"
                                                        >
                                                            <FiTrash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default NotificationDrawer;
