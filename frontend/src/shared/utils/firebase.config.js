import toast from 'react-hot-toast';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const missingFirebaseVariables = Object.entries({ ...firebaseConfig, vapidKey })
    .filter(([, value]) => !value)
    .map(([key]) => key);

let messagingInstance = null;
let foregroundListenerAttached = false;

const hasFirebaseConfiguration = () => {
    if (missingFirebaseVariables.length === 0) return true;

    console.warn(
        `[FCM Web] Missing Firebase environment values: ${missingFirebaseVariables.join(', ')}`
    );
    return false;
};

export const initFirebaseWebMessaging = async () => {
    if (messagingInstance) return messagingInstance;
    if (!hasFirebaseConfiguration()) return null;

    try {
        const [{ initializeApp, getApps }, { getMessaging, isSupported }] = await Promise.all([
            import('firebase/app'),
            import('firebase/messaging'),
        ]);

        if (!(await isSupported())) {
            console.warn('[FCM Web] Messaging is not supported in this browser.');
            return null;
        }

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        messagingInstance = getMessaging(app);
        return messagingInstance;
    } catch (error) {
        console.warn(`[FCM Web] Initialization failed: ${error.message}`);
        return null;
    }
};

const registerMessagingServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return undefined;

    const configParams = new URLSearchParams(firebaseConfig);
    const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${configParams.toString()}`,
        { scope: '/' }
    );

    await navigator.serviceWorker.ready;
    return registration;
};

export const requestFcmWebToken = async () => {
    try {
        const messaging = await initFirebaseWebMessaging();
        if (!messaging || !('Notification' in window)) return null;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn(`[FCM Web] Notification permission is ${permission}.`);
            return null;
        }

        const serviceWorkerRegistration = await registerMessagingServiceWorker();
        const { getToken } = await import('firebase/messaging');

        return await getToken(messaging, {
            vapidKey,
            ...(serviceWorkerRegistration && { serviceWorkerRegistration }),
        });
    } catch (error) {
        console.error('[FCM Web] Token request failed:', error.message);
        return null;
    }
};

export const setupFcmForegroundListener = async () => {
    if (foregroundListenerAttached) return;

    try {
        const messaging = await initFirebaseWebMessaging();
        if (!messaging) return;

        const { onMessage } = await import('firebase/messaging');
        onMessage(messaging, async (payload) => {
            const title = payload?.notification?.title || payload?.data?.title || 'Dwell Mart Notification';
            const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || '';
            const image = payload?.notification?.imageUrl || payload?.notification?.image || payload?.data?.image || '';
            const rawIcon = payload?.notification?.icon || payload?.notification?.imageUrl || payload?.data?.image || '/logo.png';
            const icon = rawIcon.startsWith('http') ? rawIcon : new URL(rawIcon, window.location.origin).href;
            const badge = new URL('/favicon.png', window.location.origin).href;
            const actionUrl = payload?.data?.actionUrl || '/notifications';

            toast(`${title}${body ? `\n${body}` : ''}`, { duration: 7000 });

            if ('serviceWorker' in navigator && Notification.permission === 'granted') {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, {
                    body,
                    icon,
                    ...(image ? { image } : {}),
                    badge,
                    tag: `dwell-mart-${Date.now()}`,
                    data: {
                        ...(payload?.data || {}),
                        url: new URL(actionUrl, window.location.origin).href,
                    },
                });
            }
        });

        foregroundListenerAttached = true;
    } catch (error) {
        console.warn('[FCM Web] Foreground listener setup failed:', error.message);
    }
};
