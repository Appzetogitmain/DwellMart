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
    FiArrowLeft,
} from 'react-icons/fi';
import { useSupportChatStore } from '../../store/supportChatStore';
import { emitTypingStart, emitTypingStop } from '../../services/socketService';
import { getReasonLabel } from './NewConversationModal';

const SupportChatWindow = ({ isAdmin = false, currentUserId, theme = 'light', onBack }) => {
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

    const isDark = theme === 'dark';
    const isClosed = activeConversation?.status === 'closed' || activeConversation?.isClosed;
    const isUserReadOnly = isClosed && !isAdmin;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typingUser]);

    if (!activeConversation) {
        return (
            <div className={`h-full min-h-[400px] sm:min-h-[500px] border rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-sm ${
                isDark
                    ? 'bg-slate-800/90 border-slate-700/80 text-white shadow-xl'
                    : 'bg-surface border-border text-content'
            }`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
                    isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-primary-50 text-primary-600'
                }`}>
                    <FiMessageSquare className="w-8 h-8" />
                </div>
                <h3 className={`text-xl font-extrabold mb-2 ${isDark ? 'text-white' : 'text-content'}`}>
                    DwellMart Support Desk
                </h3>
                <p className={`text-xs sm:text-sm max-w-sm ${isDark ? 'text-slate-400' : 'text-content-muted'}`}>
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
        <div className={`flex flex-col h-full rounded-2xl border overflow-hidden shadow-sm transition-colors ${
            isDark
                ? 'bg-slate-800/90 border-slate-700/80 text-slate-100 shadow-xl'
                : 'bg-surface border-border'
        }`}>
            {/* Header */}
            <div className={`flex-shrink-0 p-4 border-b flex flex-wrap items-center justify-between gap-3 ${
                isDark ? 'bg-slate-950/80 border-slate-700/80' : 'bg-surface-muted border-border'
            }`}>
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className={`lg:hidden p-2 rounded-xl border transition-colors ${
                                isDark
                                    ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            title="Back to Tickets"
                        >
                            <FiArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center text-sm shadow-sm ${
                        isDark ? 'bg-gradient-to-br from-amber-500 to-yellow-500 text-slate-950' : 'bg-primary-600 text-white'
                    }`}>
                        {userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-content'}`}>{reasonLabel}</h3>
                        <p className={`text-xs flex items-center gap-1.5 mt-0.5 ${isDark ? 'text-slate-400' : 'text-content-muted'}`}>
                            <FiUser className="w-3.5 h-3.5" />
                            <span>{userName}</span>
                            <span>•</span>
                            <span className="capitalize font-medium">
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
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm focus:outline-none ${
                                isDark
                                    ? 'bg-slate-900 border border-slate-700 text-white'
                                    : 'bg-surface border border-border text-content'
                            }`}
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
                <div className={`flex-shrink-0 border-b p-2.5 px-4 flex items-center gap-2 text-xs font-semibold ${
                    isDark
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                    <FiLock className="w-4 h-4 flex-shrink-0" />
                    <span>This conversation is closed and read-only.</span>
                </div>
            )}

            {/* Description prompt */}
            {activeConversation.description && (
                <div className={`flex-shrink-0 px-4 py-2 border-b text-xs flex items-start gap-2 ${
                    isDark ? 'bg-slate-950/40 border-slate-700/50 text-slate-300' : 'bg-surface-muted border-border-light text-content-secondary'
                }`}>
                    <span className="font-semibold flex-shrink-0">Issue Detail:</span>
                    <span className="italic line-clamp-1">{activeConversation.description}</span>
                </div>
            )}

            {/* Messages Feed */}
            <div className={`flex-1 overflow-y-auto min-h-0 p-4 space-y-4 ${isDark ? 'bg-slate-900/40' : ''}`}>
                {messages.map((msg, index) => {
                    const isSystem = msg.isSystemMessage || msg.senderRole === 'system';
                    const senderRole = String(msg.senderRole || '').toLowerCase();
                    const isAdminSender = senderRole === 'admin' || senderRole === 'superadmin';

                    const isMe = isAdmin ? isAdminSender : (!isAdminSender && !isSystem);

                    if (isSystem) {
                        return (
                            <div key={msg._id || index} className="flex flex-col items-start my-2">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                    <span className={`text-[11px] font-semibold ${isDark ? 'text-amber-400' : 'text-blue-700'}`}>
                                        DwellMart Support
                                    </span>
                                </div>
                                <div className={`max-w-xs md:max-w-md px-4 py-3 rounded-2xl shadow-xs text-sm leading-relaxed border rounded-bl-none ${
                                    isDark
                                        ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
                                        : 'bg-blue-50/90 text-blue-950 border-blue-100'
                                }`}>
                                    <p className="whitespace-pre-line leading-relaxed">{msg.message}</p>
                                    {msg.createdAt && (
                                        <span className={`text-[10px] block mt-1.5 ${isDark ? 'text-amber-400/70' : 'text-blue-500'}`}>
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
                                <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-content-muted'}`}>
                                    {getSenderLabel(msg.senderRole, isMe)}
                                </span>
                            </div>

                            <div
                                className={`max-w-xs md:max-w-md px-4 py-3 rounded-2xl shadow-xs text-sm leading-relaxed ${
                                    isMe
                                        ? isDark
                                            ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-semibold rounded-br-none shadow-md'
                                            : 'bg-primary-600 text-white rounded-br-none'
                                        : isDark
                                            ? 'bg-slate-950 text-slate-100 rounded-bl-none border border-slate-700/80'
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
                                                        ? isDark ? 'bg-slate-950/40 text-slate-950 hover:opacity-80' : 'bg-primary-700/60 text-white hover:bg-primary-700'
                                                        : isDark ? 'bg-slate-900 text-amber-400 border border-slate-700' : 'bg-surface text-content border border-border'
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
                                        isMe
                                            ? isDark ? 'text-slate-900 font-medium' : 'text-primary-100'
                                            : isDark ? 'text-slate-400' : 'text-content-muted'
                                    }`}
                                >
                                    <span>
                                        {new Date(msg.createdAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </span>
                                    {msg.readAt && isMe && <FiCheck className="w-3 h-3 opacity-80" />}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Typing Indicator */}
                {typingUser && (
                    <div className={`flex items-center gap-2 text-xs italic p-2 px-3 rounded-full w-fit ${
                        isDark ? 'bg-slate-900 text-slate-400 border border-slate-700' : 'bg-surface-muted text-content-muted'
                    }`}>
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" />
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span>{typingUser} is typing...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Attachments Draft Preview */}
            {attachments.length > 0 && (
                <div className={`flex-shrink-0 px-4 py-2 border-t flex flex-wrap gap-2 ${
                    isDark ? 'bg-slate-950/80 border-slate-700' : 'bg-surface-muted border-border-light'
                }`}>
                    {attachments.map((att, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-1.5 border px-3 py-1 rounded-lg text-xs shadow-xs ${
                                isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-surface border-border text-content-secondary'
                            }`}
                        >
                            <span className="truncate max-w-[120px]">{att.filename}</span>
                            <button onClick={() => removeAttachment(i)} className="text-slate-400 hover:text-red-400">
                                <FiX className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Input Footer */}
            <form onSubmit={handleSend} className={`flex-shrink-0 p-3 border-t ${
                isDark ? 'bg-slate-950/90 border-slate-700/80' : 'bg-surface border-border'
            }`}>
                <div className="flex items-center gap-2">
                    <label
                        className={`p-2.5 rounded-xl cursor-pointer transition-colors ${
                            isDark
                                ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-900'
                                : 'text-content-muted hover:text-content hover:bg-surface-muted'
                        } ${isUserReadOnly || isUploading ? 'opacity-50 pointer-events-none' : ''}`}
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
                        className={`flex-1 px-4 py-2.5 border rounded-xl text-sm transition-all focus:outline-none ${
                            isDark
                                ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20'
                                : 'bg-surface-muted border-border text-content placeholder:text-content-muted focus:bg-surface focus:ring-2 focus:ring-brand-primary'
                        } disabled:cursor-not-allowed`}
                    />

                    <button
                        type="submit"
                        disabled={isUserReadOnly || isSending || (!inputMessage.trim() && attachments.length === 0)}
                        className={`p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center ${
                            isDark
                                ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-bold hover:from-amber-400 hover:to-amber-500'
                                : 'bg-primary-600 text-white hover:bg-primary-700'
                        }`}
                    >
                        {isSending ? (
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
