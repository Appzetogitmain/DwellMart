// ═══════════════════════════════════════════════════════════════
// DwellMart Firebase Cloud Messaging Service Worker
// Handles BACKGROUND push notifications (when tab is closed/unfocused)
// ═══════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAzzIAexVKNupqOgOPsIqD-LGAz0gsOINY",
    authDomain: "dwell-mart-6cd8d.firebaseapp.com",
    projectId: "dwell-mart-6cd8d",
    storageBucket: "dwell-mart-6cd8d.firebasestorage.app",
    messagingSenderId: "468790122746",
    appId: "1:468790122746:web:726824c781a358f7219143",
});

const messaging = firebase.messaging();

// ── Service Worker Lifecycle ───────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW] Installing firebase-messaging-sw.js');
    // Skip waiting so new SW takes control immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activated firebase-messaging-sw.js — claiming all clients');
    event.waitUntil(self.clients.claim());
});

// ── Background Push Handler ────────────────────────────────────
// Fires when the app tab is CLOSED or UNFOCUSED (not controlled by onMessage)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] 🔔 onBackgroundMessage received:', JSON.stringify(payload));

    // Notify all open clients (diagnostic page will see this)
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_BACKGROUND_MSG', payload }));
    });

    const title   = payload?.notification?.title || payload?.data?.title || '🎉 DwellMart Notification';
    const body    = payload?.notification?.body  || payload?.data?.body  || payload?.data?.message || '';
    const icon    = payload?.notification?.icon  || payload?.notification?.imageUrl || 'https://dwell-mart-6cd8d.web.app/favicon.png';
    const badge   = 'https://dwell-mart-6cd8d.web.app/favicon.png';
    const actionUrl = payload?.data?.actionUrl || payload?.data?.link || '/notifications';

    const options = {
        body,
        icon,
        badge,
        tag: 'dwell-mart-' + (payload?.data?.notificationId || Date.now()),
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200],
        data: {
            url: 'http://localhost:3000' + actionUrl,
            notificationId: payload?.data?.notificationId || '',
            ...payload?.data,
        },
        actions: [
            { action: 'open', title: '📖 Open App' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    console.log('[SW] Calling self.registration.showNotification:', title);
    return self.registration.showNotification(title, options).then(() => {
        console.log('[SW] ✅ showNotification() SUCCEEDED');
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'SW_SHOW_NOTIF_SUCCESS', title }));
        });
    }).catch(e => {
        console.error('[SW] ❌ showNotification() FAILED:', e.message);
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'SW_SHOW_NOTIF_FAIL', error: e.message }));
        });
    });
});

// ── Notification Click Handler ─────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] notificationclick', event.action, event.notification.data);
    event.notification.close();

    if (event.action === 'dismiss') return;

    const urlToOpen = event.notification.data?.url || 'http://localhost:3000/notifications';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing tab if already open
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client) {
                        return client.navigate(urlToOpen);
                    }
                    return;
                }
            }
            // Open new tab if not open
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});

// ── Push Event Fallback (raw push event) ──────────────────────
// Catches pushes that may not be handled by Firebase SDK
self.addEventListener('push', (event) => {
    if (!event.data) {
        console.warn('[SW] Push event received but no data payload');
        return;
    }

    let data = {};
    try {
        data = event.data.json();
    } catch {
        data = { title: event.data.text() };
    }

    console.log('[SW] Raw push event data:', JSON.stringify(data));

    // Firebase SDK handles it via onBackgroundMessage, so only log here as diagnostic
});
