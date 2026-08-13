/**
 * 0006 — Integration API key storage hygiene (S-9).
 *
 * `partnerAuth` accepted three things as a valid API key:
 *
 *   1. sha256(pepper + key)  — the intended form
 *   2. sha256(key)           — legacy, pre-pepper
 *   3. THE STORED HASH ITSELF — pass-the-hash
 *
 * (3) means anyone who can read `apiKeyHash` — a database backup, a read
 * replica credential, an aggregation leak — can authenticate directly as that
 * partner. It also silently accepted a plaintext key if one had ever been
 * stored, defeating hashing entirely.
 *
 * This migration is the "verify no live dependency" step: it inspects every
 * stored value and reports anything that is not a well-formed SHA-256 digest.
 * Such a value is either plaintext or corrupt, and removing branch (3) would
 * lock that partner out — so the migration REFUSES rather than breaking an
 * integration silently.
 *
 * Read-only unless it finds plaintext it can safely upgrade.
 */

import crypto from 'node:crypto';
import IntegrationPartner from '../models/IntegrationPartner.model.js';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export default {
    id: '0006_integration_key_hash_hygiene',
    description: 'Verify no integration partner depends on pass-the-hash or plaintext key storage',

    async up() {
        const partners = await IntegrationPartner.find({})
            .select('+apiKeyHash name clientId isActive')
            .lean();

        if (partners.length === 0) {
            console.log('[migrate 0006] No integration partners configured — nothing depends on the removed branch.');
            return { partners: 0, malformed: 0, upgraded: 0 };
        }

        const malformed = partners.filter((p) => !SHA256_HEX.test(String(p.apiKeyHash || '')));

        if (malformed.length === 0) {
            console.log(
                `[migrate 0006] ✓ All ${partners.length} partner key(s) are well-formed SHA-256 digests. `
                + 'Removing the pass-the-hash branch is safe.'
            );
            return { partners: partners.length, malformed: 0, upgraded: 0 };
        }

        // A non-digest value is almost certainly the plaintext key. It CAN be
        // upgraded losslessly — hash it, and the partner keeps using the same
        // key — but that is a credential mutation, so it is reported and
        // requires an explicit opt-in rather than happening by default.
        console.error(
            `\n[migrate 0006] ❌ ${malformed.length} partner(s) have an apiKeyHash that is NOT a SHA-256 digest. `
            + 'These are storing the key in plaintext (or the field is corrupt).\n'
        );
        for (const p of malformed) {
            console.error(
                `  clientId=${p.clientId} name="${p.name}" active=${p.isActive} `
                + `storedLength=${String(p.apiKeyHash || '').length}`
            );
        }

        if (process.env.MIGRATE_UPGRADE_PLAINTEXT_KEYS !== 'yes') {
            throw new Error(
                `Refusing to proceed: ${malformed.length} integration partner(s) rely on plaintext key storage. `
                + 'Rotate their keys, or set MIGRATE_UPGRADE_PLAINTEXT_KEYS=yes to hash the existing values in place '
                + '(the partner keeps the same key; only its storage changes).'
            );
        }

        const pepper = String(process.env.INTEGRATION_API_KEY_PEPPER || '').trim();
        let upgraded = 0;
        for (const p of malformed) {
            const plaintext = String(p.apiKeyHash || '');
            if (!plaintext) continue;
            const hashed = crypto.createHash('sha256').update(`${pepper}:${plaintext}`).digest('hex');
            await IntegrationPartner.updateOne({ _id: p._id }, { $set: { apiKeyHash: hashed } });
            upgraded += 1;
            console.log(`[migrate 0006] Upgraded stored key for clientId=${p.clientId} to a peppered digest.`);
        }

        return { partners: partners.length, malformed: malformed.length, upgraded };
    },

    async verify() {
        const partners = await IntegrationPartner.find({}).select('+apiKeyHash clientId').lean();
        const bad = partners.filter((p) => !SHA256_HEX.test(String(p.apiKeyHash || '')));
        return {
            ok: bad.length === 0,
            detail: bad.length === 0
                ? `${partners.length} partner key(s) all well-formed`
                : `${bad.length} partner key(s) are not SHA-256 digests: ${bad.map((p) => p.clientId).join(', ')}`,
        };
    },
};
