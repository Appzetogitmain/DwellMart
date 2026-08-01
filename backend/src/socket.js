import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { verifyAccessToken } from './config/jwt.js';

let io = null;

/**
 * Decide whether this socket may watch this order, and return the room name.
 *
 * Imported lazily to keep `socket.js` free of a model import at module load —
 * it is initialised before Mongoose models are registered in some entrypoints.
 *
 * @returns {Promise<string|null>} room name, or null when access is denied.
 */
const resolveOrderRoom = async (orderRefId, { id, roleKey }) => {
    if (!orderRefId || !mongoose.isValidObjectId(orderRefId)) return null;

    // Admins already have platform-wide order visibility.
    if (roleKey === 'admin' || roleKey === 'superadmin') {
        return `order_${orderRefId}`;
    }

    try {
        const { default: Order } = await import('./models/Order.model.js');
        const order = await Order.findById(orderRefId)
            .select('userId deliveryBoyId vendorItems.vendorId')
            .lean();
        if (!order) return null;

        const viewerId = String(id || '');
        const isCustomer = roleKey === 'customer' && String(order.userId || '') === viewerId;
        const isRider = roleKey === 'delivery' && String(order.deliveryBoyId || '') === viewerId;
        const isVendor = roleKey === 'vendor'
            && (order.vendorItems || []).some((item) => String(item?.vendorId || '') === viewerId);

        if (!isCustomer && !isRider && !isVendor) return null;
        return `order_${orderRefId}`;
    } catch {
        return null;
    }
};

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: [
                process.env.CLIENT_URL,
                'https://dwell-mart-3u11.vercel.app',
                'http://localhost:3000',
                'http://localhost:5173',
                'http://localhost:3001',
            ].filter(Boolean),
            credentials: true,
        },
        pingTimeout: 30000,
        pingInterval: 10000,
    });

    // JWT Auth Middleware for Socket Connections
    io.use((socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace('Bearer ', '');

            if (!token) {
                return next(new Error('Authentication error: Token required.'));
            }

            const decoded = verifyAccessToken(token);
            socket.user = decoded; // { id, role, email }
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid or expired token.'));
        }
    });

    io.on('connection', (socket) => {
        const { id, role } = socket.user || {};
        const normalizedRole = String(role || '').toLowerCase();
        const roleKey = normalizedRole === 'user' ? 'customer' : normalizedRole;

        // Auto join user specific room and role rooms
        if (roleKey === 'admin' || roleKey === 'superadmin') {
            socket.join('admin');
        } else {
            socket.join(`${roleKey}_${id}`);
            socket.join(`user_${id}`);
        }

        // Room management
        socket.on('join_conversation', (conversationId) => {
            if (conversationId) {
                socket.join(`conversation_${conversationId}`);
            }
        });

        socket.on('leave_conversation', (conversationId) => {
            if (conversationId) {
                socket.leave(`conversation_${conversationId}`);
            }
        });

        // Realtime typing indicators
        socket.on('typing_start', ({ conversationId, name }) => {
            if (conversationId) {
                socket.to(`conversation_${conversationId}`).emit('typing_start', {
                    conversationId,
                    userId: id,
                    userRole: roleKey,
                    name: name || 'User',
                });
            }
        });

        socket.on('typing_stop', ({ conversationId }) => {
            if (conversationId) {
                socket.to(`conversation_${conversationId}`).emit('typing_stop', {
                    conversationId,
                    userId: id,
                });
            }
        });

        /**
         * Live order tracking rooms.
         *
         * Membership is authorized against the order, not granted on request —
         * `order_<id>` is a guessable room name, and it carries a rider's live
         * position plus customer order state. Only the customer who placed the
         * order, the assigned rider, a vendor in the order, or an admin may join.
         */
        socket.on('join_order_tracking', async (orderRefId, ack) => {
            const room = await resolveOrderRoom(orderRefId, { id, roleKey });
            if (!room) {
                if (typeof ack === 'function') ack({ joined: false });
                return;
            }
            socket.join(room);
            if (typeof ack === 'function') ack({ joined: true });
        });

        socket.on('leave_order_tracking', (orderRefId) => {
            if (orderRefId) {
                socket.leave(`order_${orderRefId}`);
            }
        });

        socket.on('disconnect', (reason) => {
            // socket disconnected
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io has not been initialized!');
    }
    return io;
};

export const emitToRoom = (room, event, data) => {
    if (io) {
        io.to(room).emit(event, data);
    }
};

export const emitToUserRoom = (userId, userRole, event, data) => {
    if (io) {
        const roleKey = String(userRole || '').toLowerCase() === 'user' ? 'customer' : userRole;
        io.to(`${roleKey}_${userId}`).to(`user_${userId}`).emit(event, data);
    }
};
