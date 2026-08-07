// Firebase Web FCM Config Utility
import toast from 'react-hot-toast';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAzzIAexVKNupqOgOPsIqD-LGAz0gsOINY",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dwell-mart-6cd8d.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dwell-mart-6cd8d",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dwell-mart-6cd8d.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "468790122746",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:468790122746:web:726824c781a358f7219143",
};

const DEFAULT_VAPID_KEY = "BGeOEj7jX0frPLDpNIoITNbdoUP8p5dnPAmsDusLr9xPXaEtqkG35nyrfiIqkVhrTTbouVP-qhSGXU6iFCDEe3Q";

let messagingInstance = null;

export const initFirebaseWebMessaging = async () => {
    if (messagingInstance) return messagingInstance;

    try {
        const { initializeApp, getApps } = await import('firebase/app');
        const { getMessaging, isSupported } = await import('firebase/messaging');

        const supported = await isSupported();
        if (!supported) {
            console.warn('[FCM Web] Messaging is not supported in this browser environment.');
            return null;
        }

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        messagingInstance = getMessaging(app);
        return messagingInstance;
    } catch (err) {
        console.warn(`[FCM Web Init Warning]: ${err.message}`);
        return null;
    }
};

/**
 * Register the service worker and get FCM token.
 * Returns the FCM token string or null on failure.
 */
export const requestFcmWebToken = async () => {
    try {
        const messaging = await initFirebaseWebMessaging();
        if (!messaging) {
            console.warn('[FCM Web] Firebase messaging instance could not be initialized.');
            return null;
        }

        if (typeof window !== 'undefined' && 'Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn(`[FCM Web] Notification permission is not granted. Current state: "${permission}".`);
                return null;
            }
            console.log('[FCM Web] ✅ Notification.permission =', permission);
        } else {
            console.warn('[FCM Web] Notification API not supported in window.');
            return null;
        }

        // Register & activate service worker before getting token
        let swRegistration = undefined;
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            try {
                // Unregister stale SW registrations first
                const existingRegs = await navigator.serviceWorker.getRegistrations();
                for (const reg of existingRegs) {
                    if (reg.scope.includes(window.location.origin) && !reg.active) {
                        await reg.unregister();
                        console.log('[FCM Web] Removed stale/inactive SW:', reg.scope);
                    }
                }

                swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                console.log('[FCM Web] Service Worker registered, scope:', swRegistration.scope);

                // Wait for SW to become active
                await new Promise((resolve) => {
                    if (swRegistration.active) { resolve(); return; }
                    const sw = swRegistration.installing || swRegistration.waiting;
                    if (sw) {
                        sw.addEventListener('statechange', function handler() {
                            if (this.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(); }
                        });
                    } else {
                        // Already active via ready
                        navigator.serviceWorker.ready.then(() => resolve());
                    }
                });

                // Claim clients so SW controls the page immediately
                await navigator.serviceWorker.ready;
                console.log('[FCM Web] ✅ Service Worker ACTIVE and controlling page');
            } catch (swErr) {
                console.warn(`[FCM Web] Service worker registration warning: ${swErr.message}`);
            }
        }

        const { getToken } = await import('firebase/messaging');
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || DEFAULT_VAPID_KEY;

        const tokenOptions = { vapidKey };
        if (swRegistration) {
            tokenOptions.serviceWorkerRegistration = swRegistration;
        }

        const token = await getToken(messaging, tokenOptions);
        if (token) {
            console.log('[FCM Web] ✅ Token generated:', token.substring(0, 25) + '...');
        } else {
            console.warn('[FCM Web] ⚠️ Firebase returned empty token. Check VAPID key and SW registration.');
        }
        return token || null;
    } catch (error) {
        console.error('[FCM Web Token Error]:', error.message, error.code || '');
        return null;
    }
};

/**
 * Sets up foreground push listener.
 * When the app tab is open & focused, FCM routes pushes to onMessage() — NOT the service worker.
 * This handler must explicitly call reg.showNotification() to pop up the OS banner.
 */
export const setupFcmForegroundListener = async () => {
    try {
        const messaging = await initFirebaseWebMessaging();
        if (!messaging) return;

        const { onMessage } = await import('firebase/messaging');

        onMessage(messaging, async (payload) => {
            console.log('[FCM Web] 🔔 Foreground push received:', payload);

            const title = payload?.notification?.title || payload?.data?.title || '🎉 DwellMart Notification';
            const body  = payload?.notification?.body  || payload?.data?.body  || payload?.data?.message || '';
            const icon  = payload?.notification?.icon  || 'https://dwell-mart-6cd8d.web.app/favicon.png';
            const actionUrl = payload?.data?.actionUrl || '/notifications';

            // ── Layer 1: In-App Toast Banner (always fires) ──────────────────
            toast(
                `🔔 ${title}${body ? '\n' + body : ''}`,
                {
                    duration: 7000,
                    style: {
                        borderRadius: '14px',
                        background: '#0F172A',
                        color: '#FFFFFF',
                        border: '1px solid rgba(245, 158, 11, 0.5)',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
                        padding: '14px 18px',
                        fontSize: '13px',
                        fontWeight: '600',
                        maxWidth: '400px',
                        cursor: 'pointer',
                    },
                }
            );

            // ── Layer 2: OS Desktop Notification via Active Service Worker ──
            // Chrome requires reg.showNotification() from a SERVICE WORKER context
            // new Notification() from page context is blocked on modern Chrome (localhost).
            if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    console.log('[FCM Web] SW ready, scope:', reg.scope, '| active:', !!reg.active);

                    if (reg.active) {
                        await reg.showNotification(title, {
                            body,
                            icon,
                            badge: icon,
                            tag: 'dwell-mart-' + Date.now(),
                            requireInteraction: false,
                            silent: false,
                            data: { url: `http://localhost:3000${actionUrl}`, ...(payload?.data || {}) },
                            vibrate: [200, 100, 200],
                            actions: [
                                { action: 'open', title: '📖 Open' },
                                { action: 'dismiss', title: 'Dismiss' },
                            ],
                        });
                        console.log('[FCM Web] ✅ reg.showNotification() called — OS popup should appear');
                    } else {
                        console.warn('[FCM Web] ⚠️ Service Worker is registered but NOT active. Cannot showNotification.');
                    }
                } catch (swErr) {
                    console.warn('[FCM Web] ⚠️ reg.showNotification() error:', swErr.message);
                }
            }
        });

        console.log('[FCM Web] ✅ Foreground listener attached via onMessage()');
    } catch (err) {
        console.warn('[FCM Web] Setup foreground listener warning:', err.message);
    }
};
