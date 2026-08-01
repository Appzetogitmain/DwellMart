import { FiSearch, FiClock } from 'react-icons/fi';
import { useSupportChatStore } from '../../store/supportChatStore';
import { getReasonLabel } from './NewConversationModal';

const STATUS_COLOR_MAP = {
    open: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    resolved: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    closed: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
};

const STATUS_COLOR_MAP_LIGHT = {
    open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    resolved: 'bg-amber-100 text-amber-800 border-amber-200',
    closed: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ConversationList = ({ isAdmin = false, currentRole = 'customer', theme = 'light' }) => {
    const {
        conversations,
        activeConversation,
        selectConversation,
        isLoading,
        filters,
        setFilters,
    } = useSupportChatStore();

    const isDark = theme === 'dark';

    return (
        <div className={`flex flex-col h-full rounded-2xl border overflow-hidden shadow-sm transition-colors ${
            isDark
                ? 'bg-slate-800/90 border-slate-700/80 text-slate-100 shadow-xl'
                : 'bg-white border-gray-200 text-gray-900'
        }`}>
            {/* Search and Filters Header */}
            <div className={`p-4 border-b space-y-3 flex-shrink-0 ${
                isDark ? 'bg-slate-950/80 border-slate-700/80' : 'bg-gray-50/50 border-gray-100'
            }`}>
                <div className="relative">
                    <FiSearch className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${
                        isDark ? 'text-slate-400' : 'text-gray-400'
                    }`} />
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => setFilters({ search: e.target.value })}
                        placeholder="Search conversation reason, message..."
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none ${
                            isDark
                                ? 'bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20'
                                : 'bg-white border border-gray-200 text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                        }`}
                    />
                </div>

                {/* Admin Filters: Portal & Status */}
                {isAdmin && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <select
                            value={filters.role}
                            onChange={(e) => setFilters({ role: e.target.value })}
                            className={`w-full px-2.5 py-1.5 rounded-lg font-semibold focus:outline-none ${
                                isDark
                                    ? 'bg-slate-900 border border-slate-700 text-slate-200'
                                    : 'bg-white border border-gray-200 text-gray-700'
                            }`}
                        >
                            <option value="">All Portals</option>
                            <option value="customer">Customer</option>
                            <option value="vendor">Vendor</option>
                            <option value="delivery">Delivery</option>
                        </select>

                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ status: e.target.value })}
                            className={`w-full px-2.5 py-1.5 rounded-lg font-semibold focus:outline-none ${
                                isDark
                                    ? 'bg-slate-900 border border-slate-700 text-slate-200'
                                    : 'bg-white border border-gray-200 text-gray-700'
                            }`}
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

            {/* List Body */}
            <div className={`flex-1 overflow-y-auto divide-y min-h-0 ${
                isDark ? 'divide-slate-700/60' : 'divide-gray-100'
            }`}>
                {isLoading && conversations.length === 0 ? (
                    <div className="flex justify-center p-8">
                        <div className={`w-8 h-8 border-3 border-t-transparent rounded-full animate-spin ${
                            isDark ? 'border-amber-400' : 'border-primary-600'
                        }`} />
                    </div>
                ) : conversations.length === 0 ? (
                    <div className={`p-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
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
                        const statusBadgeClass = isDark
                            ? (STATUS_COLOR_MAP[item.status] || STATUS_COLOR_MAP.open)
                            : (STATUS_COLOR_MAP_LIGHT[item.status] || STATUS_COLOR_MAP_LIGHT.open);

                        return (
                            <div
                                key={item._id}
                                onClick={() => selectConversation(item._id)}
                                className={`p-4 cursor-pointer transition-all relative ${
                                    isDark
                                        ? isSelected
                                            ? 'bg-amber-500/10 border-l-4 border-amber-500'
                                            : 'hover:bg-slate-700/40'
                                        : isSelected
                                            ? 'bg-primary-50/60 border-l-4 border-primary-600'
                                            : 'hover:bg-gray-50/80'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-1.5 gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                            isDark
                                                ? 'bg-slate-950 text-amber-400 border border-slate-700'
                                                : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            {userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className={`font-semibold text-sm truncate ${
                                                isDark ? 'text-white' : 'text-gray-900'
                                            }`}>
                                                {reasonLabel}
                                            </h4>
                                            <p className={`text-xs truncate flex items-center gap-1 ${
                                                isDark ? 'text-slate-400' : 'text-gray-500'
                                            }`}>
                                                <span>{userName}</span>
                                                <span className={`capitalize px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                                    isDark ? 'bg-slate-950 text-slate-300' : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {roleBadge}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border capitalize flex-shrink-0 ${statusBadgeClass}`}
                                    >
                                        {item.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <p className={`text-xs line-clamp-1 mb-2 pl-10 ${
                                    isDark ? 'text-slate-300' : 'text-gray-600'
                                }`}>
                                    {item.lastMessage || 'No messages yet.'}
                                </p>

                                <div className={`flex items-center justify-between pl-10 text-[11px] ${
                                    isDark ? 'text-slate-400' : 'text-gray-400'
                                }`}>
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
                                        <span className="px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full animate-bounce">
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
