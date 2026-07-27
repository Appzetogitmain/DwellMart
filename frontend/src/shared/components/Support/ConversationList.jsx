import { FiSearch, FiClock } from 'react-icons/fi';
import { useSupportChatStore } from '../../store/supportChatStore';
import { getReasonLabel } from './NewConversationModal';

const STATUS_COLOR_MAP = {
    open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    resolved: 'bg-amber-100 text-amber-800 border-amber-200',
    closed: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ConversationList = ({ isAdmin = false, currentRole = 'customer' }) => {
    const {
        conversations,
        activeConversation,
        selectConversation,
        isLoading,
        filters,
        setFilters,
    } = useSupportChatStore();

    return (
        <div className="flex flex-col h-[620px] bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Search and Filters Header */}
            <div className="p-4 border-b border-gray-100 space-y-3 bg-gray-50/50 flex-shrink-0">
                <div className="relative">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => setFilters({ search: e.target.value })}
                        placeholder="Search conversation reason, message..."
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                    />
                </div>

                {/* Admin Filters: Portal & Status */}
                {isAdmin && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <select
                            value={filters.role}
                            onChange={(e) => setFilters({ role: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                            <option value="">All Portals</option>
                            <option value="customer">Customer</option>
                            <option value="vendor">Vendor</option>
                            <option value="delivery">Delivery</option>
                        </select>

                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ status: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                )}
            </div>

            {/* List Body (Flex 1, Overflow Y Auto) */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0">
                {isLoading && conversations.length === 0 ? (
                    <div className="flex justify-center p-8">
                        <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                        No support conversations found.
                    </div>
                ) : (
                    conversations.map((item) => {
                        const isSelected = activeConversation?._id === item._id;
                        const unread = isAdmin ? item.unreadAdmin : item.unreadUser;
                        const userName =
                            item.user?.name ||
                            item.user?.fullName ||
                            item.user?.storeName ||
                            `User (#${String(item.user?._id || item.user).slice(-4)})`;
                        const roleBadge = item.userRole || 'customer';
                        const reasonLabel = getReasonLabel(item.reason);

                        return (
                            <div
                                key={item._id}
                                onClick={() => selectConversation(item._id)}
                                className={`p-4 cursor-pointer transition-all hover:bg-gray-50/80 relative ${
                                    isSelected ? 'bg-primary-50/60 border-l-4 border-primary-600' : ''
                                }`}
                            >
                                <div className="flex items-start justify-between mb-1.5 gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0">
                                            {userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-semibold text-sm text-gray-900 truncate">
                                                {reasonLabel}
                                            </h4>
                                            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                                <span>{userName}</span>
                                                <span className="capitalize px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                                                    {roleBadge}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border capitalize flex-shrink-0 ${
                                            STATUS_COLOR_MAP[item.status] || STATUS_COLOR_MAP.open
                                        }`}
                                    >
                                        {item.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <p className="text-xs text-gray-600 line-clamp-1 mb-2 pl-10">
                                    {item.lastMessage || 'No messages yet.'}
                                </p>

                                <div className="flex items-center justify-between pl-10 text-[11px] text-gray-400">
                                    <span className="flex items-center gap-1">
                                        <FiClock className="w-3 h-3" />
                                        {item.lastMessageAt
                                            ? new Date(item.lastMessageAt).toLocaleTimeString([], {
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                              })
                                            : ''}
                                    </span>

                                    {unread > 0 && (
                                        <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full animate-bounce">
                                            {unread} new
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default ConversationList;
