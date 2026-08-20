/**
 * Migration: retire delivery-partner passwords, and make the mobile number the
 * delivery/vendor identity.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Delivery partners now authenticate with a mobile number and a WhatsApp OTP.
 * The `password` field, its bcrypt hook and `comparePassword` were removed from
 * the schema, and the password-reset endpoints were deleted with them.
 *
 * Removing a field from a Mongoose schema does NOT remove it from the stored
 * documents — it only stops the application reading it. Every existing delivery
 * partner therefore still carries a bcrypt hash and, in some cases, a live
 * password-reset OTP. Those are credentials for an authentication path that no
 * longer exists: nothing can use them, and nothing should keep them.
 *
 * This migration unsets them, and backfills `phoneE164` so the number every
 * partner now logs in with is actually addressable on WhatsApp.
 *
 * SAFETY
 * ──────
 *   - Idempotent: a second run matches nothing, because the fields are gone.
 *   - Non-destructive to identity: `phone` is read, never rewritten.
 *   - Duplicate-tolerant: no unique index is created. Duplicates are REPORTED,
 *     because a shared number now means a shared login and an operator has to
 *     resolve it.
 */

import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { toE164, isValidE164 } from '../utils/phone.js';

export const id = '0015_delivery_passwordless_and_phone_identity';
export const description = 'Unset retired delivery password/reset credentials and backfill phoneE164';

/** Credentials belonging to authentication paths that no longer exist. */
const RETIRED_FIELDS = {
    password: '',
    resetOtp: '',
    resetOtpExpiry: '',
    resetOtpVerified: '',
};

export const up = async () => {
    // ── 1. Backfill phoneE164 from the legacy national-only phone ────────────
    const cursor = DeliveryBoy.collection.find(
        { phone: { $exists: true, $nin: [null, ''] } },
        { projection: { phone: 1, phoneE164: 1 } },
    );

    const operations = [];
    let scanned = 0;
    let filled = 0;
    let unnormalisable = 0;
    const seen = new Map();

    const flush = async () => {
        if (!operations.length) return;
        await DeliveryBoy.collection.bulkWrite(operations, { ordered: false });
        operations.length = 0;
    };

    for await (const doc of cursor) {
        scanned += 1;

        if (isValidE164(doc.phoneE164)) {
            seen.set(doc.phoneE164, (seen.get(doc.phoneE164) || 0) + 1);
            continue;
        }

        const e164 = toE164(doc.phone);
        if (!e164) {
            unnormalisable += 1;
            continue;
        }

        seen.set(e164, (seen.get(e164) || 0) + 1);
        filled += 1;
        operations.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { phoneE164: e164 } } } });
        if (operations.length >= 500) await flush();
    }
    await flush();

    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);

    // ── 2. Unset the retired credentials ─────────────────────────────────────
    const result = await DeliveryBoy.collection.updateMany(
        { $or: Object.keys(RETIRED_FIELDS).map((field) => ({ [field]: { $exists: true } })) },
        { $unset: RETIRED_FIELDS },
    );

    console.log(
        `[Migration 0015] phoneE164: scanned=${scanned} filled=${filled} `
        + `unnormalisable=${unnormalisable} duplicateNumbers=${duplicates.length}`,
    );
    console.log(`[Migration 0015] retired credentials cleared from ${result.modifiedCount} delivery partner(s)`);

    if (unnormalisable > 0) {
        // These partners cannot log in until an operator corrects the number —
        // it is their only credential now. Say so loudly rather than leaving it
        // to be discovered as a support ticket.
        console.warn(
            `[Migration 0015] WARNING: ${unnormalisable} delivery partner(s) have a phone `
            + 'that cannot be normalised to E.164 and therefore cannot log in until corrected.',
        );
    }
    if (duplicates.length > 0) {
        console.warn(
            `[Migration 0015] WARNING: ${duplicates.length} mobile number(s) are shared by more than one `
            + 'delivery partner. A shared number is now a shared login and must be resolved.',
        );
    }
};

export const verify = async () => {
    const withRetired = await DeliveryBoy.countDocuments({
        $or: Object.keys(RETIRED_FIELDS).map((field) => ({ [field]: { $exists: true } })),
    });

    if (withRetired > 0) {
        return { ok: false, detail: `${withRetired} delivery partner(s) still carry retired credentials` };
    }

    const malformed = await DeliveryBoy.countDocuments({
        phoneE164: { $nin: [null, ''] },
        $expr: { $not: { $regexMatch: { input: '$phoneE164', regex: /^\+[1-9]\d{7,14}$/ } } },
    });
    if (malformed > 0) {
        return { ok: false, detail: `${malformed} malformed phoneE164 value(s)` };
    }

    const loginCapable = await DeliveryBoy.countDocuments({ phoneE164: { $nin: [null, ''] } });
    const total = await DeliveryBoy.countDocuments({});

    return {
        ok: true,
        detail: `retiredCredentials=0; malformed=0; loginCapable=${loginCapable}/${total}`,
    };
};

export default { id, description, up, verify };
