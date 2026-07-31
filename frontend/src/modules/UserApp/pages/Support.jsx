import { useEffect, useState } from 'react';
import { FiPlus, FiHelpCircle, FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useSupportChatStore } from '../../../shared/store/supportChatStore';
import { useAuthStore } from '../../../shared/store/authStore';
import { initNotificationListeners } from '../../../shared/services/notificationSocketService';
import ConversationList from '../../../shared/components/Support/ConversationList';
import SupportChatWindow from '../../../shared/components/Support/SupportChatWindow';
import NewConversationModal from '../../../shared/components/Support/NewConversationModal';

const CustomerSupport = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
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
        <div className="min-h-screen bg-surface-muted py-6 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header Banner */}
                <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2.5 hover:bg-surface-muted rounded-xl text-content-secondary transition-colors"
                        >
                            <FiArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="p-3 bg-surface-muted border border-border text-brand-primary rounded-2xl">
                            <FiHelpCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-content">
                                DwellMart Support Center
                            </h1>
                            <p className="text-xs sm:text-sm text-content-secondary">
                                Contact DwellMart Customer Support Desk & track your queries in real-time
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primaryHover text-black font-semibold text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
                    >
                        <FiPlus className="w-4 h-4" />
                        <span>New Conversation</span>
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
                        <ConversationList isAdmin={false} currentRole="customer" />
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
                                className="text-xs font-semibold text-brand-primary flex items-center gap-1 p-2"
                            >
                                <FiArrowLeft className="w-4 h-4" /> Back to conversations
                            </button>
                        </div>
                        <SupportChatWindow isAdmin={false} currentUserId={user?._id || user?.id} />
                    </div>
                </div>

                {/* New Ticket Modal */}
                <NewConversationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    role="customer"
                />
            </div>
        </div>
    );
};

export default CustomerSupport;
