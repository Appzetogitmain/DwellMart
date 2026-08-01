import { io } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';

let socket = null;
let currentToken = null;

const getActiveToken = () => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    
    let token = null;
    if (path.startsWith('/admin')) {
        token = localStorage.getItem('adminToken') || localStorage.getItem('admin-token');
    } else if (path.startsWith('/vendor')) {
        token = localStorage.getItem('vendor-token') || localStorage.getItem('vendorToken');
    } else if (path.startsWith('/delivery')) {
        token = localStorage.getItem('delivery-token') || localStorage.getItem('deliveryToken');
    }

    if (!token) {
        token =
            localStorage.getItem('token') ||
            localStorage.getItem('adminToken') ||
            localStorage.getItem('admin-token') ||
            localStorage.getItem('vendor-token') ||
            localStorage.getItem('delivery-token');
    }

    return token;
};

const getSocketUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:5000';
    if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
    if (API_BASE_URL && API_BASE_URL.startsWith('http')) {
        return API_BASE_URL.replace(/\/api\/?$/, '');
    }
    return window.location.origin;
};

export const connectSocket = () => {
    const token = getActiveToken();
    if (!token) {
        if (socket) {
            socket.disconnect();
            socket = null;
            currentToken = null;
        }
        return null;
    }

    if (socket && socket.connected && currentToken === token) {
        return socket;
    }

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    currentToken = token;
    const socketUrl = getSocketUrl();

    socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
        // Socket connected
    });

    socket.on('connect_error', (error) => {
        console.warn('Socket connection error:', error.message);
    });

    socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect') {
            socket.connect();
        }
    });

    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
        currentToken = null;
    }
};

export const getSocket = () => socket;

export const joinConversationRoom = (conversationId) => {
    const s = connectSocket();
    if (s && conversationId) {
        s.emit('join_conversation', conversationId);
    }
};

export const leaveConversationRoom = (conversationId) => {
    const s = getSocket();
    if (s && conversationId) {
        s.emit('leave_conversation', conversationId);
    }
};

/**
 * Join an order's live-tracking room.
 *
 * The server authorizes membership against the order — passing an id you do not
 * own is rejected there, not here. Resolves to true only when the join was
 * actually granted, so callers can fall back to polling.
 *
 * @param {string} orderRefId The order's ObjectId (not the human orderId).
 */
export const joinOrderTrackingRoom = (orderRefId) =>
  new Promise((resolve) => {
    const s = connectSocket();
    if (!s || !orderRefId) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Don't hang a UI on a server that never acks.
    const timer = setTimeout(() => finish(false), 5000);
    s.emit("join_order_tracking", orderRefId, (response) => {
      clearTimeout(timer);
      finish(Boolean(response?.joined));
    });
  });

export const leaveOrderTrackingRoom = (orderRefId) => {
  const s = getSocket();
  if (s && orderRefId) {
    s.emit("leave_order_tracking", orderRefId);
  }
};

export const emitTypingStart = (conversationId, name) => {
    const s = connectSocket();
    if (s && conversationId) {
        s.emit('typing_start', { conversationId, name });
    }
};

export const emitTypingStop = (conversationId) => {
    const s = getSocket();
    if (s && conversationId) {
        s.emit('typing_stop', { conversationId });
    }
};
