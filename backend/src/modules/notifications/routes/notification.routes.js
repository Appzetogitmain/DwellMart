import { Router } from 'express';
import { authenticate } from '../../../middlewares/authenticate.js';
import {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    sendTestPushNotification,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(authenticate);

router.post('/test-push', sendTestPushNotification);
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/clear-all', clearAllNotifications);
router.delete('/:id', deleteNotification);

export default router;
