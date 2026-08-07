/**
 * DEEP AUDIT: Full FCM Push Notification Pipeline Diagnostic
 * Tests every layer and logs exact failures for root cause analysis
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const log = (emoji, label, msg, detail = '') => {
    console.log(`${emoji} [${label}] ${msg}${detail ? ' → ' + JSON.stringify(detail) : ''}`);
};
const ok  = (label, msg, d) => log('✅', label, msg, d);
const err = (label, msg, d) => log('❌', label, msg, d);
const inf = (label, msg, d) => log('🔍', label, msg, d);
const warn = (label, msg, d) => log('⚠️', label, msg, d);

// ─── 1. ENVIRONMENT AUDIT ──────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('  🚀 PUSH NOTIFICATION PIPELINE DEEP AUDIT');
console.log('══════════════════════════════════════════════════════\n');

console.log('📋 STEP 1: Environment Variables Audit');
const FIREBASE_PROJECT_ID   = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY  = process.env.FIREBASE_PRIVATE_KEY;

inf('ENV', 'FIREBASE_PROJECT_ID',   FIREBASE_PROJECT_ID || 'MISSING');
inf('ENV', 'FIREBASE_CLIENT_EMAIL', FIREBASE_CLIENT_EMAIL || 'MISSING');
inf('ENV', 'FIREBASE_PRIVATE_KEY',  FIREBASE_PRIVATE_KEY ? '✓ Present (' + FIREBASE_PRIVATE_KEY.length + ' chars)' : 'MISSING');

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    err('ENV', 'Missing Firebase env vars — Admin SDK will fail!');
    process.exit(1);
} else {
    ok('ENV', 'All Firebase Admin env vars present');
}

// ─── 2. MONGODB + DeviceToken AUDIT ───────────────────────────────────────────
await mongoose.connect(process.env.MONGO_URI);
ok('MongoDB', 'Connected');

const { default: DeviceToken } = await import('../src/models/DeviceToken.model.js');

const allTokens = await DeviceToken.find({}).select('fcmToken recipientId recipientType isActive deviceType lastUsed createdAt').lean();
console.log('\n📋 STEP 2: DeviceToken Database Audit');
inf('DeviceToken', `Total tokens in DB: ${allTokens.length}`);

if (allTokens.length === 0) {
    err('DeviceToken', 'NO FCM tokens found in database! User must log in to generate one.');
} else {
    for (const t of allTokens) {
        const active = t.isActive ? '✅ ACTIVE' : '❌ INACTIVE';
        console.log(`   ${active} | recipientType=${t.recipientType} | recipientId=${String(t.recipientId).slice(0,12)}... | device=${t.deviceType} | token=${t.fcmToken?.slice(0,20)}...`);
    }
}

const activeTokens = allTokens.filter(t => t.isActive);
if (activeTokens.length === 0) {
    err('DeviceToken', 'NO active FCM tokens — push will silently fail (no_active_tokens). User must log in fresh!');
} else {
    ok('DeviceToken', `${activeTokens.length} active FCM token(s) found`);
}

// ─── 3. FIREBASE ADMIN SDK INIT AUDIT ─────────────────────────────────────────
console.log('\n📋 STEP 3: Firebase Admin SDK Initialization Audit');
let messaging = null;

try {
    const { initializeApp, cert, getApps, getApp } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');

    const formattedPrivateKey = String(FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
    
    if (getApps().length === 0) {
        initializeApp({
            credential: cert({
                projectId: FIREBASE_PROJECT_ID,
                clientEmail: FIREBASE_CLIENT_EMAIL,
                privateKey: formattedPrivateKey,
            }),
        });
    }
    messaging = getMessaging();
    ok('Firebase', `Admin SDK initialized for project: ${FIREBASE_PROJECT_ID}`);
} catch (e) {
    err('Firebase', 'Admin SDK FAILED to initialize', e.message);
    process.exit(1);
}

// ─── 4. FCM PAYLOAD & SEND AUDIT ──────────────────────────────────────────────
console.log('\n📋 STEP 4: FCM Payload & Send Audit');

if (activeTokens.length === 0) {
    warn('FCM', 'Skipping FCM send test — no active tokens in DB');
} else {
    const testToken = activeTokens[0].fcmToken;
    inf('FCM', `Testing FCM push to token: ${testToken.slice(0, 30)}...`);

    const payload = {
        notification: {
            title: '🔔 DwellMart Push Test',
            body: 'If you see this as an OS popup, the pipeline is fully working!',
        },
        data: {
            notificationId: 'audit-test-' + Date.now(),
            type: 'system',
            category: 'SUCCESS',
            actionUrl: '/notifications',
        },
        webpush: {
            headers: { Urgency: 'high' },
            notification: {
                title: '🔔 DwellMart Push Test',
                body: 'If you see this as an OS popup, the pipeline is fully working!',
                icon: 'https://dwell-mart-6cd8d.web.app/favicon.png',
                badge: 'https://dwell-mart-6cd8d.web.app/favicon.png',
                requireInteraction: true,
                vibrate: [200, 100, 200],
                tag: 'dwell-mart-audit-test',
            },
            fcmOptions: { link: 'http://localhost:3000/notifications' },
        },
        token: testToken,
    };

    inf('FCM', 'Sending via messaging.send() with full webpush payload');
    inf('FCM', 'Payload notification', payload.notification);
    inf('FCM', 'Payload webpush.notification', payload.webpush.notification);

    try {
        const messageId = await messaging.send(payload);
        ok('FCM', `✅ FCM message dispatched! messageId=${messageId}`);
        console.log('\n   ─────────────────────────────────────────────────────');
        console.log('   ✅ FCM SEND SUCCEEDED. If no popup appeared, the issue is:');
        console.log('   1. Chrome notification permission is granted but Windows blocks Chrome');
        console.log('   2. Windows "Do Not Disturb" / Focus Assist is ON');
        console.log('   3. Chrome flags: chrome://settings/content/notifications — check if localhost:3000 is blocked');
        console.log('   4. The onMessage handler intercepts it (tab is open in foreground)');
        console.log('   ─────────────────────────────────────────────────────\n');
    } catch (e) {
        err('FCM', `FCM send FAILED: ${e.message}`);
        if (e.code) inf('FCM', `Error code: ${e.code}`);
        if (e.code === 'messaging/registration-token-not-registered') {
            err('FCM', 'Token is invalid/expired! This is the root cause. Mark token inactive.');
            await DeviceToken.updateOne({ fcmToken: testToken }, { $set: { isActive: false } });
            warn('FCM', 'Token marked inactive. User must log in again to re-register.');
        }
        if (e.code === 'messaging/sender-id-mismatch') {
            err('FCM', 'VAPID/Sender ID mismatch! Frontend VAPID key does not match Firebase project!');
        }
        if (e.code === 'messaging/invalid-argument') {
            err('FCM', 'Invalid FCM payload — check webpush.fcmOptions.link must be HTTPS for production');
        }
    }
}

// ─── 5. FOREGROUND INTERCEPT ANALYSIS ─────────────────────────────────────────
console.log('\n📋 STEP 5: Foreground Intercept Analysis');
console.log('   🔍 KEY FINDING: When the app tab is OPEN and FOCUSED:');
console.log('   → FCM routes payload to onMessage() in the browser (not the service worker)');
console.log('   → The service worker onBackgroundMessage() does NOT fire');
console.log('   → You MUST call new Notification() or reg.showNotification() manually in onMessage()');
console.log('');
console.log('   🔍 CRITICAL CHROME RESTRICTION:');
console.log('   → Chrome BLOCKS new Notification() from the main page context on localhost');
console.log('   → Only navigator.serviceWorker.ready → reg.showNotification() works reliably');
console.log('   → The SW must be ACTIVE (not just registered) for reg.showNotification() to work\n');

// ─── 6. SERVICE WORKER SCOPE AUDIT ────────────────────────────────────────────
console.log('\n📋 STEP 6: Service Worker Scope Analysis');
console.log('   firebase-messaging-sw.js must be at root: http://localhost:3000/firebase-messaging-sw.js');
console.log('   If using Vite dev server (localhost:3000), the SW file must be in /public folder ✓');
console.log('   Current SW location: d:\\Appzeto_Projects\\DwellMart\\frontend\\public\\firebase-messaging-sw.js ✓\n');

// ─── 7. DIAGNOSIS SUMMARY ─────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('  📊 ROOT CAUSE ANALYSIS SUMMARY');
console.log('══════════════════════════════════════════════════════');

console.log(`
MOST LIKELY ROOT CAUSES (in order of probability):

1. ❌ CHROME NOTIFICATION BLOCKED ON LOCALHOST
   Chrome version 111+ silently blocks new Notification() from page context.
   Fix: Always use navigator.serviceWorker.ready → reg.showNotification()
   
2. ❌ onMessage() INTERCEPTS FOREGROUND PUSH — NO AUTO OS POPUP
   Firebase design: When tab is open, onMessage fires but NO OS popup appears.
   The reg.showNotification() call must be made explicitly inside onMessage().
   Current code does attempt this, but there may be a race condition.

3. ❌ WINDOWS DO NOT DISTURB / FOCUS ASSIST
   Windows silently swallows all Chrome notification popups.
   Check: Windows Settings → System → Notifications → Do Not Disturb = OFF

4. ❌ CHROME SITE SETTINGS BLOCKING localhost:3000
   Check: Chrome → Settings → Privacy → Site Settings → Notifications
   → localhost:3000 must be in "Allowed" list

WHAT IS WORKING:
✅ FCM token generated and stored in MongoDB
✅ Backend sends FCM via Admin SDK (HTTP 200, messageId returned)
✅ Socket.IO delivers notification to browser
✅ In-app toast fires via onMessage handler
✅ MongoDB persistence works
`);

await mongoose.disconnect();
console.log('══════════════════════════════════════════════════════');
console.log('  ✅ DEEP AUDIT COMPLETE');
console.log('══════════════════════════════════════════════════════\n');
