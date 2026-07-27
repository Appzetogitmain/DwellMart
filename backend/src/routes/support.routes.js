import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { uploadDocumentSingle } from '../middlewares/upload.js';
import {
    createConversation,
    getConversations,
    getConversationById,
    sendMessage,
    updateStatus,
    markAsRead,
    getUnreadCount,
    deleteMessage,
    uploadAttachment,
} from '../controllers/support.controller.js';

const router = Router();

router.use(authenticate);

router.post('/conversations', createConversation);
router.get('/conversations', getConversations);
router.get('/unread-count', getUnreadCount);
router.get('/conversations/:id', getConversationById);
router.post('/conversations/:id/messages', sendMessage);
router.patch('/conversations/:id/read', markAsRead);

// Admin-only endpoints
router.patch('/conversations/:id/status', authorize('admin', 'superadmin'), updateStatus);
router.delete('/conversations/:id/messages/:messageId', authorize('admin', 'superadmin'), deleteMessage);

// Upload attachment (JPG, PNG, PDF max 10MB)
router.post('/upload-attachment', uploadDocumentSingle('file'), uploadAttachment);

export default router;
