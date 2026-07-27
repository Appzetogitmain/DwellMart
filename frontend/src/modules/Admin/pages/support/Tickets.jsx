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
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                        <FiHelpCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                            Support Desk Management
                        </h1>
                        <p className="text-xs sm:text-sm text-gray-500">
                            Manage support conversations from Customers, Vendors, and Delivery Partners in real-time
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[680px]">
                {/* Sidebar / Conversation List */}
                <div
                    className={`lg:col-span-4 h-full ${
                        activeTab === 'chat' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    <ConversationList isAdmin={true} currentRole="admin" />
                </div>

                {/* Chat Window */}
                <div
                    className={`lg:col-span-8 h-full ${
                        activeTab === 'list' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    <SupportChatWindow isAdmin={true} currentUserId={admin?.id || admin?._id} />
                </div>
            </div>
        </div>
    );
};

export default Tickets;
