import { Router } from 'express';
import { authenticate } from '../../../middlewares/authenticate.js';
import {
    registerToken,
    unregisterToken,
} from '../controllers/deviceToken.controller.js';

const router = Router();

router.use(authenticate);

router.post('/register', registerToken);
router.post('/unregister', unregisterToken);

export default router;
