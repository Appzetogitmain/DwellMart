import React, { useEffect } from 'react';
import { FiBell } from 'react-icons/fi';
import { useNotificationStore } from '../../store/useNotificationStore';

export const NotificationBell = ({ className = '', iconClassName = 'w-5 h-5 text-gray-700' }) => {
    const unreadCount = useNotificationStore((state) => state.unreadCount);
    const fetchUnreadCount = useNotificationStore((state) => state.fetchUnreadCount);
    const setDrawerOpen = useNotificationStore((state) => state.setDrawerOpen);
    const isDrawerOpen = useNotificationStore((state) => state.isDrawerOpen);

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

    return (
        <button
            onClick={() => setDrawerOpen(!isDrawerOpen)}
            className={`relative p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none ${className}`}
            title="Notifications"
            aria-label="Notifications"
        >
            <FiBell className={iconClassName} />
            {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow-sm animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default NotificationBell;
