importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = Object.fromEntries(new URL(self.location.href).searchParams.entries());

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'DwellMart Notification';
    const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || '';
    const icon = payload?.notification?.icon || '/favicon.png';
    const actionUrl = payload?.data?.actionUrl || payload?.data?.link || '/notifications';

    return self.registration.showNotification(title, {
        body,
        icon,
        badge: icon,
        tag: `dwell-mart-${payload?.data?.notificationId || Date.now()}`,
        data: {
            ...(payload?.data || {}),
            url: new URL(actionUrl, self.location.origin).href,
        },
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || `${self.location.origin}/notifications`;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
            const existingClient = clients[0];
            if (existingClient) {
                await existingClient.navigate(urlToOpen);
                return existingClient.focus();
            }
            return self.clients.openWindow(urlToOpen);
        })
    );
});
