import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FiMessageCircle, FiSend, FiUser, FiSearch } from "react-icons/fi";
import { motion } from "framer-motion";
import Badge from "../../../shared/components/Badge";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import {
  getVendorChatThreads,
  getVendorChatMessages,
  sendVendorChatMessage,
  markVendorChatRead,
} from "../services/vendorService";

const Chat = () => {
  const { vendor } = useVendorAuthStore();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const vendorId = vendor?.id || vendor?._id;

  const fetchThreads = useCallback(async () => {
    if (!vendorId) return;
    setIsLoadingChats(true);
    try {
      const res = await getVendorChatThreads();
      const data = res?.data ?? res;
      setChats(Array.isArray(data) ? data : []);
    } catch {
      setChats([]);
    } finally {
      setIsLoadingChats(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (!selectedChat?._id) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await getVendorChatMessages(selectedChat._id);
        const data = res?.data ?? res;
        setMessages(Array.isArray(data) ? data : []);
      } catch {
        setMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [selectedChat?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    setChats((prev) =>
      prev.map((c) =>
        c._id === chat._id ? { ...c, unreadCount: 0, status: "active" } : c
      )
    );
    try {
      await markVendorChatRead(chat._id);
    } catch {
      // global toast handled by api.js
    }
  };

  const handleSendMessage = async () => {
    const message = newMessage.trim();
    if (!message || !selectedChat?._id || isSending) return;

    setIsSending(true);
    try {
      const res = await sendVendorChatMessage(selectedChat._id, message);
      const created = (res?.data ?? res) || null;

      if (created) {
        setMessages((prev) => [...prev, created]);
      }

      setNewMessage("");
      const nowIso = new Date().toISOString();
      setChats((prev) =>
        prev.map((c) =>
          c._id === selectedChat._id
            ? {
                ...c,
                lastMessage: message,
                lastActivity: created?.time || nowIso,
                unreadCount: 0,
              }
            : c
        )
      );
      setSelectedChat((prev) =>
        prev
          ? {
              ...prev,
              lastMessage: message,
              lastActivity: created?.time || nowIso,
              unreadCount: 0,
            }
          : prev
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredChats = useMemo(
    () =>
      chats.filter((chat) => {
        const orderText = String(chat.orderDisplayId || "").toLowerCase();
        const customerText = String(chat.customerName || "").toLowerCase();
        const matchesSearch =
          !searchQuery ||
          customerText.includes(searchQuery.toLowerCase()) ||
          orderText.includes(searchQuery.toLowerCase());
        const matchesStatus =
          filterStatus === "all" || chat.status === filterStatus;
        return matchesSearch && matchesStatus;
      }),
    [chats, filterStatus, searchQuery]
  );

  const activeChats = chats.filter((c) => c.status === "active").length;
  const unreadCount = chats.reduce((sum, c) => sum + Number(c.unreadCount || 0), 0);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to access chat</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Chat
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Communicate with customers and support
          </p>
        </div>
        <div className="flex items-center gap-4">
          {unreadCount > 0 && (
            <Badge variant="warning" className="text-sm">
              {unreadCount} Unread
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="relative mb-4">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus("all")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  filterStatus === "all"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All ({chats.length})
              </button>
              <button
                onClick={() => setFilterStatus("active")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  filterStatus === "active"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Active ({activeChats})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoadingChats ? (
              <div className="p-8 text-center text-gray-500">Loading chats...</div>
            ) : filteredChats.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {filteredChats.map((chat) => (
                  <div
                    key={chat._id}
                    onClick={() => handleSelectChat(chat)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedChat?._id === chat._id
                        ? "bg-primary-50 border-l-4 border-primary-600"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <FiUser className="text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 truncate">
                            {chat.customerName}
                          </h3>
                          <p className="text-xs text-gray-500 truncate">
                            {chat.orderDisplayId
                              ? `Order: ${chat.orderDisplayId}`
                              : chat.customerEmail}
                          </p>
                        </div>
                      </div>
                      {chat.unreadCount > 0 && (
                        <Badge variant="warning" className="text-xs">
                          {chat.unreadCount}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate mb-1">
                      {chat.lastMessage || "No messages yet"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {chat.lastActivity
                        ? new Date(chat.lastActivity).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <FiMessageCircle className="text-4xl text-gray-400 mb-4" />
                <p className="text-gray-500">No chats found</p>
              </div>
            )}
          </div>
        </div>

        {selectedChat ? (
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-primary-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <FiUser className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      {selectedChat.customerName}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {selectedChat.orderDisplayId
                        ? `Order: ${selectedChat.orderDisplayId}`
                        : selectedChat.customerEmail}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={selectedChat.status === "active" ? "success" : "info"}
                  className="text-xs"
                >
                  {selectedChat.status === "active" ? "Active" : "Resolved"}
                </Badge>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[500px]">
              {isLoadingMessages ? (
                <div className="text-center py-8 text-gray-500">Loading messages...</div>
              ) : messages.length > 0 ? (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.sender === "vendor" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        msg.sender === "vendor"
                          ? "bg-primary-600 text-white"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      <p className="text-sm">{msg.message}</p>
                      <p
                        className={`text-xs mt-1 ${
                          msg.sender === "vendor"
                            ? "text-primary-100"
                            : "text-gray-500"
                        }`}
                      >
                        {new Date(msg.time).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400">
                  <FiMessageCircle className="text-3xl mb-2 opacity-50" />
                  <p className="text-sm font-medium text-gray-600">No messages yet</p>
                  <p className="text-xs text-gray-400 mt-1">Type a message below to start the conversation.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60"
                >
                  <FiSend />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center p-12">
            <div className="text-center">
              <FiMessageCircle className="mx-auto text-4xl text-gray-400 mb-4" />
              <p className="text-gray-500">Select a chat to start conversation</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Chat;
