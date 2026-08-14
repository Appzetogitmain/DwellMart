import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiBell,
    FiCheck,
    FiTrash2,
    FiSearch,
    FiExternalLink,
    FiPackage,
    FiInfo,
    FiAlertTriangle,
    FiTruck,
    FiShoppingBag,
    FiCheckCircle,
    FiArrowLeft,
} from 'react-icons/fi';
import { useNotificationStore } from '../../../shared/store/useNotificationStore';
import DesktopHeader from '../components/Layout/DesktopHeader';
import Footer from '../components/Layout/Footer';
import { navigateToNotificationTarget } from '../../../shared/utils/notificationNavigator';

const NotificationsPage = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const {
        notifications,
        unreadCount,
        isLoading,
        activeTab,
        page,
        pages,
        total,
        setActiveTab,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
    } = useNotificationStore();

    useEffect(() => {
        fetchNotifications({ page: 1 });
    }, [fetchNotifications, activeTab]);

    const getCategoryBadge = (category, type) => {
        const cat = String(category || type || '').toUpperCase();
        if (cat.includes('ORDER')) {
            return <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><FiShoppingBag className="w-5 h-5" /></div>;
        }
        if (cat.includes('DELIVERY')) {
            return <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"><FiTruck className="w-5 h-5" /></div>;
        }
        if (cat.includes('SUCCESS') || cat.includes('APPROVAL')) {
            return <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"><FiCheckCircle className="w-5 h-5" /></div>;
        }
        if (cat.includes('WARNING') || cat.includes('ERROR')) {
            return <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"><FiAlertTriangle className="w-5 h-5" /></div>;
        }
        return <div className="p-2.5 rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"><FiInfo className="w-5 h-5" /></div>;
    };

    const filteredNotifications = notifications.filter((n) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            n.title?.toLowerCase().includes(q) ||
            n.message?.toLowerCase().includes(q) ||
            n.body?.toLowerCase().includes(q)
        );
    });

    const handleActionClick = (n) => {
        navigateToNotificationTarget(n, navigate, 'user', markAsRead);
    };

    const tabs = [
        { id: 'all', label: 'All' },
        { id: 'unread', label: `Unread (${unreadCount})` },
        { id: 'order', label: 'Orders' },
        { id: 'system', label: 'System' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
            <DesktopHeader />

            <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
                {/* Top Title Banner */}
                <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.history.length > 2) {
                                        navigate(-1);
                                    } else {
                                        navigate('/');
                                    }
                                }}
                                className="p-2 -ml-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
                                title="Go Back"
                                aria-label="Go Back"
                            >
                                <FiArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="p-2 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 rounded-xl">
                                <FiBell className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                                Notifications
                            </h1>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Stay updated with real-time order alerts, promotional deals, and account status updates.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <FiCheck className="w-4 h-4" /> Mark All Read
                            </button>
                        )}
                        {notifications.length > 0 && (
                            <button
                                onClick={clearAllNotifications}
                                className="px-4 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <FiTrash2 className="w-4 h-4" /> Clear All
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Controls Bar */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'bg-primary-600 text-white shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Search Bar */}
                    <div className="relative w-full md:w-64">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search notifications..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                </div>

                {/* Notifications Content Area */}
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="bg-white dark:bg-gray-900 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-800">
                            <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-xs text-gray-500 font-medium">Fetching notifications...</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 rounded-3xl p-16 text-center border border-gray-100 dark:border-gray-800">
                            <FiPackage className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4 stroke-[1.5]" />
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Notifications</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                                You do not have any notifications in this category right now.
                            </p>
                        </div>
                    ) : (
                        filteredNotifications.map((n) => (
                            <div
                                key={n._id}
                                onClick={() => handleActionClick(n)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-primary-300 ${
                                    !n.isRead
                                        ? 'bg-blue-50/40 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/40'
                                        : 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800'
                                }`}
                            >
                                <div className="flex items-start gap-4">
                                    {getCategoryBadge(n.category, n.type)}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className={`text-base ${!n.isRead ? 'font-black text-gray-900 dark:text-white' : 'font-semibold text-gray-700 dark:text-gray-300'}`}>
                                                {n.title}
                                            </h3>
                                            <span className="text-xs text-gray-400 whitespace-nowrap">
                                                {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed">
                                            {n.message || n.body}
                                        </p>

                                        <div className="mt-4 flex items-center justify-between gap-2">
                                            {n.actionUrl ? (
                                                <button
                                                    onClick={() => handleActionClick(n)}
                                                    className="px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-bold hover:bg-primary-100 transition-colors flex items-center gap-1.5"
                                                >
                                                    View Details <FiExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                            ) : <div />}

                                            <div className="flex items-center gap-2">
                                                {!n.isRead && (
                                                    <button
                                                        onClick={() => markAsRead(n._id)}
                                                        className="px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                                    >
                                                        <FiCheck className="w-3.5 h-3.5 text-emerald-500" /> Mark Read
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => deleteNotification(n._id)}
                                                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs transition-colors"
                                                    title="Delete"
                                                >
                                                    <FiTrash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {pages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-2">
                        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                            <button
                                key={p}
                                onClick={() => fetchNotifications({ page: p })}
                                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                                    page === p
                                        ? 'bg-primary-600 text-white shadow-md'
                                        : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default NotificationsPage;
