import { useEffect, useState } from 'react';
import { FiPlus, FiHelpCircle, FiArrowLeft } from 'react-icons/fi';
import { useSupportChatStore } from '../../../shared/store/supportChatStore';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import { initNotificationListeners } from '../../../shared/services/notificationSocketService';
import ConversationList from '../../../shared/components/Support/ConversationList';
import SupportChatWindow from '../../../shared/components/Support/SupportChatWindow';
import NewConversationModal from '../../../shared/components/Support/NewConversationModal';

const SupportTickets = () => {
    const { vendor } = useVendorAuthStore();
    const { fetchConversations, activeConversation } = useSupportChatStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
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
                            Vendor Support Center
                        </h1>
                        <p className="text-xs sm:text-sm text-gray-500">
                            Contact Dwell Mart Admin & Support Team for store verification, subscriptions, or settlements
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                    <FiPlus className="w-4 h-4" />
                    <span>New Ticket</span>
                </button>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[650px]">
                {/* Sidebar / Conversation List */}
                <div
                    className={`lg:col-span-4 h-full ${
                        activeTab === 'chat' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    <ConversationList isAdmin={false} currentRole="vendor" />
                </div>

                {/* Chat Window */}
                <div
                    className={`lg:col-span-8 h-full ${
                        activeTab === 'list' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    {/* Mobile Back to List Button */}
                    <div className="lg:hidden mb-2">
                        <button
                            onClick={() => setActiveTab('list')}
                            className="text-xs font-semibold text-primary-600 flex items-center gap-1 p-2"
                        >
                            <FiArrowLeft className="w-4 h-4" /> Back to tickets list
                        </button>
                    </div>
                    <SupportChatWindow isAdmin={false} currentUserId={vendor?.id || vendor?._id} />
                </div>
            </div>

            {/* New Ticket Modal */}
            <NewConversationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                role="vendor"
            />
        </div>
    );
};

export default SupportTickets;
