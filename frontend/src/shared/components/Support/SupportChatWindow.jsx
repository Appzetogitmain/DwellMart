import { useState, useEffect, useRef } from 'react';
import {
    FiSend,
    FiPaperclip,
    FiLock,
    FiCheck,
    FiFileText,
    FiImage,
    FiUser,
    FiMessageSquare,
    FiX,
} from 'react-icons/fi';
import { useSupportChatStore } from '../../store/supportChatStore';
import { emitTypingStart, emitTypingStop } from '../../services/socketService';
import { getReasonLabel } from './NewConversationModal';

const SupportChatWindow = ({ isAdmin = false, currentUserId }) => {
    const {
        activeConversation,
        messages,
        sendMessage,
        updateStatus,
        uploadAttachment,
        isSending,
        typingUser,
    } = useSupportChatStore();

    const [inputMessage, setInputMessage] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    const isClosed = activeConversation?.status === 'closed' || activeConversation?.isClosed;
    const isUserReadOnly = isClosed && !isAdmin;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typingUser]);

    if (!activeConversation) {
        return (
            <div className="h-full min-h-[550px] bg-surface border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
                <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center text-primary-600 mb-4">
                    <FiMessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-content mb-2">DwellMart Support Desk</h3>
                <p className="text-sm text-content-muted max-w-sm">
                    Select an active support conversation from the list or click "New Ticket" to contact DwellMart Support.
                </p>
            </div>
        );
    }

    const userName =
        activeConversation.user?.name ||
        activeConversation.user?.fullName ||
        activeConversation.user?.storeName ||
        'User';

    const reasonLabel = getReasonLabel(activeConversation.reason);

    const handleInputChange = (e) => {
        setInputMessage(e.target.value);
        if (activeConversation?._id) {
            emitTypingStart(activeConversation._id, isAdmin ? 'Support Desk' : userName);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                emitTypingStop(activeConversation._id);
            }, 2000);
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        setIsUploading(true);
        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) {
                alert('File size exceeds 10MB limit.');
                continue;
            }
            const uploaded = await uploadAttachment(file);
            if (uploaded) {
                setAttachments((prev) => [...prev, uploaded]);
            }
        }
        setIsUploading(false);
    };

    const removeAttachment = (index) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (isUserReadOnly) return;
        if (!inputMessage.trim() && attachments.length === 0) return;

        emitTypingStop(activeConversation._id);
        const text = inputMessage.trim();
        const atts = [...attachments];

        setInputMessage('');
        setAttachments([]);

        await sendMessage({ message: text, attachments: atts });
    };

    const getSenderLabel = (msgSenderRole, isMe) => {
        const role = String(msgSenderRole || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin') {
            return isMe ? 'Support Team (You)' : 'Support Team';
        }
        if (role === 'customer' || role === 'user') {
            return isMe ? `${userName} (You)` : userName;
        }
        if (role === 'vendor') {
            return isMe ? 'Vendor Store (You)' : 'Vendor';
        }
        if (role === 'delivery') {
            return isMe ? 'Delivery Partner (You)' : 'Delivery Partner';
        }
        return isMe ? 'You' : 'User';
    };

    return (
        <div className="flex flex-col h-[620px] bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
            {/* Header (Flex Shrink 0) */}
            <div className="flex-shrink-0 p-4 border-b border-border bg-surface-muted flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                        {userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold text-content text-base">{reasonLabel}</h3>
                        <p className="text-xs text-content-muted flex items-center gap-1.5 mt-0.5">
                            <FiUser className="w-3.5 h-3.5" />
                            <span>{userName}</span>
                            <span>•</span>
                            <span className="capitalize font-medium text-content-secondary">
                                {activeConversation.userRole}
                            </span>
                        </p>
                    </div>
                </div>

                {/* Admin Status Dropdown */}
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <select
                            value={activeConversation.status}
                            onChange={(e) => updateStatus(activeConversation._id, e.target.value)}
                            className="px-3 py-1.5 bg-surface border border-border rounded-xl text-xs font-semibold text-content shadow-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        >
                            <option value="open">Status: Open</option>
                            <option value="in_progress">Status: In Progress</option>
                            <option value="resolved">Status: Resolved</option>
                            <option value="closed">Status: Closed</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Closed Read-Only Banner */}
            {isClosed && (
                <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 p-2.5 px-4 flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <FiLock className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    <span>This conversation is closed and read-only.</span>
                </div>
            )}

            {/* Description prompt if available */}
            {activeConversation.description && (
                <div className="flex-shrink-0 px-4 py-2 bg-surface-muted border-b border-border-light text-xs text-content-secondary flex items-start gap-2">
                    <span className="font-semibold text-content-secondary flex-shrink-0">Issue Detail:</span>
                    <span className="italic line-clamp-1">{activeConversation.description}</span>
                </div>
            )}

            {/* Messages Feed (Flex 1, Overflow Y Auto, Min H 0) */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                {messages.map((msg, index) => {
                    const isSystem = msg.isSystemMessage || msg.senderRole === 'system';
                    const senderRole = String(msg.senderRole || '').toLowerCase();
                    const isAdminSender = senderRole === 'admin' || senderRole === 'superadmin';

                    const isMe = isAdmin ? isAdminSender : (!isAdminSender && !isSystem);

                    if (isSystem) {
                        return (
                            <div key={msg._id || index} className="flex flex-col items-start my-2">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                    <span className="text-[11px] font-semibold text-blue-700">
                                        DwellMart Support
                                    </span>
                                </div>
                                <div className="max-w-xs md:max-w-md px-4 py-3 rounded-2xl shadow-xs text-sm leading-relaxed bg-blue-50/90 text-blue-950 border border-blue-100 rounded-bl-none">
                                    <p className="whitespace-pre-line leading-relaxed">{msg.message}</p>
                                    {msg.createdAt && (
                                        <span className="text-[10px] text-blue-500 block mt-1.5">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={msg._id || index}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                            <div className="flex items-center gap-1.5 mb-1 px-1">
                                <span className="text-[11px] font-semibold text-content-muted">
                                    {getSenderLabel(msg.senderRole, isMe)}
                                </span>
                            </div>

                            <div
                                className={`max-w-xs md:max-w-md px-4 py-3 rounded-2xl shadow-xs text-sm leading-relaxed ${
                                    isMe
                                        ? 'bg-primary-600 text-white rounded-br-none'
                                        : 'bg-surface-muted text-content rounded-bl-none border border-border'
                                }`}
                            >
                                {msg.message && <p className="whitespace-pre-line">{msg.message}</p>}

                                {/* Attachments */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {msg.attachments.map((att, attIdx) => (
                                            <a
                                                key={attIdx}
                                                href={att.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={`flex items-center gap-2 p-2 rounded-xl text-xs font-medium transition-opacity ${
                                                    isMe
                                                        ? 'bg-primary-700/60 text-white hover:bg-primary-700'
                                                        : 'bg-surface text-content border border-border hover:bg-surface-muted'
                                                }`}
                                            >
                                                {att.fileType === 'image' || att.url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                                    <FiImage className="w-4 h-4" />
                                                ) : (
                                                    <FiFileText className="w-4 h-4" />
                                                )}
                                                <span className="truncate max-w-[180px]">{att.filename || 'Attachment'}</span>
                                            </a>
                                        ))}
                                    </div>
                                )}

                                <div
                                    className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 ${
                                        isMe ? 'text-primary-100' : 'text-content-muted'
                                    }`}
                                >
                                    <span>
                                        {new Date(msg.createdAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </span>
                                    {msg.readAt && isMe && <FiCheck className="w-3 h-3 text-brand-primary/60" />}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Typing Indicator */}
                {typingUser && (
                    <div className="flex items-center gap-2 text-xs text-content-muted italic bg-surface-muted p-2 px-3 rounded-full w-fit">
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-content-muted rounded-full animate-bounce" />
                            <span className="w-1.5 h-1.5 bg-content-muted rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="w-1.5 h-1.5 bg-content-muted rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span>{typingUser} is typing...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Attachments Draft Preview (Flex Shrink 0) */}
            {attachments.length > 0 && (
                <div className="flex-shrink-0 px-4 py-2 bg-surface-muted border-t border-border-light flex flex-wrap gap-2">
                    {attachments.map((att, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-1.5 bg-surface border border-border px-3 py-1 rounded-lg text-xs text-content-secondary shadow-xs"
                        >
                            <span className="truncate max-w-[120px]">{att.filename}</span>
                            <button onClick={() => removeAttachment(i)} className="text-content-muted hover:text-status-error">
                                <FiX className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Input Footer (Flex Shrink 0, ALWAYS VISIBLE AT BOTTOM) */}
            <form onSubmit={handleSend} className="flex-shrink-0 p-3 border-t border-border bg-surface">
                <div className="flex items-center gap-2">
                    <label
                        className={`p-2.5 rounded-xl cursor-pointer text-content-muted hover:text-content hover:bg-surface-muted transition-colors ${
                            isUserReadOnly || isUploading ? 'opacity-50 pointer-events-none' : ''
                        }`}
                        title="Attach JPG, PNG, PDF (max 10MB)"
                    >
                        <FiPaperclip className="w-5 h-5" />
                        <input
                            type="file"
                            onChange={handleFileUpload}
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden"
                            disabled={isUserReadOnly || isUploading}
                        />
                    </label>

                    <input
                        type="text"
                        value={inputMessage}
                        onChange={handleInputChange}
                        disabled={isUserReadOnly || isSending}
                        placeholder={
                            isUserReadOnly
                                ? 'This conversation is closed.'
                                : 'Type your support message...'
                        }
                        className="flex-1 px-4 py-2.5 bg-surface-muted border border-border rounded-xl text-sm text-content placeholder:text-content-muted focus:bg-surface focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all disabled:bg-surface-elevated disabled:cursor-not-allowed"
                    />

                    <button
                        type="submit"
                        disabled={isUserReadOnly || isSending || (!inputMessage.trim() && attachments.length === 0)}
                        className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center"
                    >
                        {isSending ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <FiSend className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default SupportChatWindow;
