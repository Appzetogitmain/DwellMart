import { useEffect, useState } from 'react';
import { FiPlus, FiHelpCircle, FiArrowLeft } from 'react-icons/fi';
import { useSupportChatStore } from '../../../shared/store/supportChatStore';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { initNotificationListeners } from '../../../shared/services/notificationSocketService';
import ConversationList from '../../../shared/components/Support/ConversationList';
import SupportChatWindow from '../../../shared/components/Support/SupportChatWindow';
import NewConversationModal from '../../../shared/components/Support/NewConversationModal';

const DeliverySupport = () => {
    const { deliveryBoy } = useDeliveryAuthStore();
    const { fetchConversations, activeConversation, selectConversation } = useSupportChatStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('list'); // 'list' | 'chat' for mobile screens

    useEffect(() => {
        initNotificationListeners();
        fetchConversations();
    }, [fetchConversations]);

    useEffect(() => {
        if (activeConversation) {
            setActiveTab('chat');
        }
    }, [activeConversation]);

    const handleBackToList = () => {
        setActiveTab('list');
        selectConversation(null);
    };

    return (
        <div className="space-y-3 sm:space-y-6 select-none max-w-6xl mx-auto">
            {/* Header Banner — Hidden on mobile when viewing active chat for maximum viewport space */}
            <div className={`bg-slate-800/90 backdrop-blur-xl rounded-3xl p-4 sm:p-6 shadow-xl border border-amber-500/20 flex flex-wrap items-center justify-between gap-3 ${
                activeTab === 'chat' ? 'hidden lg:flex' : 'flex'
            }`}>
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl shrink-0">
                        <FiHelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                        <h1 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight">
                            Delivery Partner Support
                        </h1>
                        <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                            Support for delivery assignments, route issues, COD collection, or account queries
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm rounded-2xl shadow-md transition-all flex items-center gap-2 self-end sm:self-auto"
                >
                    <FiPlus className="w-4 h-4 text-slate-950 font-bold" />
                    <span>New Ticket</span>
                </button>
            </div>

            {/* Responsive Main Content Grid */}
            <div className={`grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 ${
                activeTab === 'chat'
                    ? 'h-[calc(100dvh-130px)] sm:h-[calc(100vh-230px)] min-h-[360px] sm:min-h-[450px] lg:max-h-[720px]'
                    : 'h-[calc(100vh-230px)] min-h-[450px] max-h-[720px]'
            }`}>
                {/* Conversation List Column */}
                <div
                    className={`lg:col-span-4 h-full ${
                        activeTab === 'chat' ? 'hidden lg:block' : 'block'
                    }`}
                >
                    <ConversationList isAdmin={false} currentRole="delivery" theme="dark" />
                </div>

                {/* Chat Window Column — Full Screen Overlay on Mobile */}
                <div
                    className={`h-full flex flex-col min-h-0 ${
                        activeTab === 'list'
                            ? 'hidden lg:flex lg:col-span-8'
                            : 'fixed inset-0 z-[9990] bg-slate-900 flex flex-col w-full h-[100dvh] p-0 lg:relative lg:inset-auto lg:z-auto lg:h-full lg:bg-transparent lg:col-span-8'
                    }`}
                >
                    <div className="flex-1 h-full min-h-0">
                        <SupportChatWindow
                            isAdmin={false}
                            currentUserId={deliveryBoy?.id || deliveryBoy?._id}
                            theme="dark"
                            onBack={handleBackToList}
                        />
                    </div>
                </div>
            </div>

            {/* New Ticket Modal */}
            <NewConversationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                role="delivery"
                theme="dark"
            />
        </div>
    );
};

export default DeliverySupport;
