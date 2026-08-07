import DeviceToken from '../models/DeviceToken.model.js';

let isFirebaseConfigured = false;
let messagingService = null;

const initFirebase = async () => {
    if (messagingService) return isFirebaseConfigured;
    try {
        const { initializeApp, cert, getApps } = await import('firebase-admin/app');
        const { getMessaging } = await import('firebase-admin/messaging');

        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (process.env.GOOGLE_APPLICATION_CREDENTIALS || (projectId && clientEmail && privateKey)) {
            if (getApps().length === 0) {
                if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                    initializeApp();
                    console.log('[Firebase] Initialized Admin SDK with GOOGLE_APPLICATION_CREDENTIALS');
                } else {
                    const formattedPrivateKey = String(privateKey).replace(/\\n/g, '\n');
                    initializeApp({
                        credential: cert({
                            projectId,
                            clientEmail,
                            privateKey: formattedPrivateKey,
                        }),
                    });
                    console.log(`[Firebase] Initialized Admin SDK for project "${projectId}"`);
                }
            }
            messagingService = getMessaging();
            isFirebaseConfigured = true;
        } else {
            console.warn('[Firebase] Credentials incomplete. FCM Push running in fallback mode.');
        }
    } catch (err) {
        console.warn(`[Firebase] Push fallback active (${err.message}). DB & Socket notifications remain active.`);
        isFirebaseConfigured = false;
    }
    return isFirebaseConfigured;
};

// Initialize asynchronously
initFirebase().catch(() => null);

export const isFcmAvailable = () => isFirebaseConfigured;

/**
 * Send FCM push notification to multiple device tokens
 */
export const sendMulticastPushNotification = async ({ tokens = [], title, body, data = {}, image = '' }) => {
    if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };
    await initFirebase();

    if (!isFirebaseConfigured || !messagingService) {
        return { successCount: 0, failureCount: tokens.length, fallback: true };
    }

    const payload = {
        notification: {
            title: String(title || ''),
            body: String(body || ''),
            ...(image ? { imageUrl: image } : {}),
        },
        data: Object.fromEntries(
            Object.entries(data || {}).map(([k, v]) => [String(k), String(v ?? '')])
        ),
        webpush: {
            headers: {
                Urgency: 'high',
            },
            notification: {
                title: String(title || ''),
                body: String(body || ''),
                icon: image || '/login_logo.png',
                badge: '/login_logo.png',
                requireInteraction: true,
            },
            fcmOptions: {
                link: data?.actionUrl || '/notifications',
            },
        },
        tokens,
    };

    try {
        const response = await messagingService.sendEachForMulticast(payload);

        // Cleanup invalid or expired tokens automatically
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code;
                if (
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered'
                ) {
                    invalidTokens.push(tokens[idx]);
                }
            }
        });

        if (invalidTokens.length > 0) {
            await DeviceToken.updateMany(
                { fcmToken: { $in: invalidTokens } },
                { $set: { isActive: false, lastSeen: new Date() } }
            );
            console.log(`[Firebase] Marked ${invalidTokens.length} stale FCM tokens as inactive.`);
        }

        return {
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    } catch (error) {
        console.error('[Firebase] Multicast push dispatch error:', error.message);
        return { successCount: 0, failureCount: tokens.length, error: error.message };
    }
};
