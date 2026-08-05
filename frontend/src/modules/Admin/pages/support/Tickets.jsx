import { useEffect, useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import { useSupportChatStore } from '../../../../shared/store/supportChatStore';
import { useAdminAuthStore } from '../../store/adminStore';
import { initNotificationListeners } from '../../../../shared/services/notificationSocketService';
import ConversationList from '../../../../shared/components/Support/ConversationList';
import SupportChatWindow from '../../../../shared/components/Support/SupportChatWindow';

const Tickets = () => {
    const { admin } = useAdminAuthStore();
    const { fetchConversations, activeConversation } = useSupportChatStore();
    const [activeTab, setActiveTab] = useState('list'); // 'list' | 'chat' for mobile

    useEffect(() => {
        initNotificationListeners();
        fetchConversations();
    }, [fetchConversations]);

    useEffect(() => {
        if (activeConversation) {
            setActiveTab('chat');
        }
    }, [activeConversation]);

    return (
        <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col overflow-hidden">
            {/* Compact Header Banner */}
            <div className="bg-white rounded-2xl px-5 py-3.5 shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                        <FiHelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight">
                            Live Support Desk
                        </h1>
                        <p className="text-xs text-gray-500">
                            Real-time customer, vendor, and delivery partner support conversations
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Fixed Height Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-hidden">
                {/* Sidebar / Conversation List */}
                <div
                    className={`lg:col-span-4 h-full overflow-hidden ${
                        activeTab === 'chat' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    <ConversationList isAdmin={true} currentRole="admin" />
                </div>

                {/* Chat Window */}
                <div
                    className={`lg:col-span-8 h-full overflow-hidden ${
                        activeTab === 'list' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    <SupportChatWindow
                        isAdmin={true}
                        currentUserId={admin?.id || admin?._id}
                        onBack={() => setActiveTab('list')}
                    />
                </div>
            </div>
        </div>
    );
};

export default Tickets;
