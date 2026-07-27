import { useEffect } from 'react';
import { FiBell } from 'react-icons/fi';
import { useNotificationStore } from '../../store/notificationStore';

const NotificationBadge = ({ onClick, className = '' }) => {
    const { unreadCount, fetchUnreadCount } = useNotificationStore();

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

    return (
        <button
            onClick={onClick}
            className={`relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none transition-colors rounded-full hover:bg-gray-100 ${className}`}
            title="Notifications"
        >
            <FiBell className="w-5 h-5" />
            {unreadCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default NotificationBadge;
