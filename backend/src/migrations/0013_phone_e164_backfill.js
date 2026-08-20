/**
 * Migration: backfill `phoneE164` on User, Vendor and DeliveryBoy.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Registration normalised phone numbers with
 * `String(phone).replace(/\D/g,'').slice(-10)`, which keeps the last ten
 * digits and throws the country code away. Every stored `phone` is therefore a
 * bare national number with no record of the country it belongs to.
 *
 * WhatsApp addresses recipients in E.164, so those values cannot be used to
 * send anything as they stand. This migration derives `phoneE164` from them
 * once, into a NEW field, rather than leaving every send site to re-guess a
 * dial code independently.
 *
 * SAFETY PROPERTIES
 * ─────────────────
 *   - Additive. `phone` is never read-modified-written; it is only read.
 *   - Idempotent. A document that already holds a valid `phoneE164` is skipped,
 *     so a second run writes nothing.
 *   - Tolerant of duplicates. Two accounts may legitimately share a number
 *     today; no unique index is created and duplicates do not fail the run.
 *     They are counted and reported so the ambiguity is visible.
 *   - Non-fatal on bad data. A phone that cannot be normalised is counted and
 *     left alone; the account keeps working on the email OTP path.
 *
 * `phoneVerified` is deliberately NOT set. A number inherited from a
 * self-declared registration field has never been proven to belong to the
 * account holder, and password reset trusts that flag.
 */

import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { toE164, isValidE164 } from '../utils/phone.js';

export const id = '0013_phone_e164_backfill';
export const description = 'Backfill phoneE164 (E.164) from the legacy national-only phone field';

const TARGETS = [
    { name: 'User', model: () => User },
    { name: 'Vendor', model: () => Vendor },
    { name: 'DeliveryBoy', model: () => DeliveryBoy },
];

const backfillCollection = async (Model, label) => {
    const cursor = Model.collection.find(
        { phone: { $exists: true, $nin: [null, ''] } },
        { projection: { phone: 1, phoneE164: 1 } }
    );

    const operations = [];
    let scanned = 0;
    let filled = 0;
    let alreadyValid = 0;
    let unnormalisable = 0;
    const seen = new Map();

    const flush = async () => {
        if (!operations.length) return;
        await Model.collection.bulkWrite(operations, { ordered: false });
        operations.length = 0;
    };

    for await (const doc of cursor) {
        scanned += 1;

        // Idempotency: an already-valid value is authoritative and untouched.
        if (isValidE164(doc.phoneE164)) {
            alreadyValid += 1;
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

    const duplicates = [...seen.values()].filter((count) => count > 1).length;

    console.log(
        `[Migration 0013] ${label}: scanned=${scanned} filled=${filled} `
        + `alreadyValid=${alreadyValid} unnormalisable=${unnormalisable} duplicateNumbers=${duplicates}`
    );

    return { scanned, filled, alreadyValid, unnormalisable, duplicates };
};

export const up = async () => {
    for (const target of TARGETS) {
        await backfillCollection(target.model(), target.name);
    }
};

export const verify = async () => {
    const details = [];

    for (const target of TARGETS) {
        const Model = target.model();

        // A document that HAS a usable phone but still has no phoneE164 is the
        // failure this migration exists to prevent. Documents whose phone could
        // not be normalised are expected to remain null, so they are counted
        // separately rather than treated as a failure.
        const withPhone = await Model.countDocuments({ phone: { $exists: true, $nin: [null, ''] } });
        const withE164 = await Model.countDocuments({ phoneE164: { $nin: [null, ''] } });

        // Anything written must be well-formed.
        const malformed = await Model.countDocuments({
            phoneE164: { $nin: [null, ''] },
            $expr: { $not: { $regexMatch: { input: '$phoneE164', regex: /^\+[1-9]\d{7,14}$/ } } },
        });

        if (malformed > 0) {
            return { ok: false, detail: `${target.name}: ${malformed} malformed phoneE164 value(s)` };
        }

        details.push(`${target.name}(phone=${withPhone},e164=${withE164})`);
    }

    return { ok: true, detail: details.join('; ') };
};

export default { id, description, up, verify };
