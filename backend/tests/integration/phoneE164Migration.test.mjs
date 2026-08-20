/**
 * Migration 0013 — phoneE164 backfill, against a real MongoDB.
 *
 * The properties that matter here cannot be asserted in a pure unit test: the
 * migration must survive duplicate phone numbers that already exist in
 * production, must not rewrite anything on a second run, and must leave the
 * legacy `phone` field byte-identical.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import User from '../../src/models/User.model.js';
import Vendor from '../../src/models/Vendor.model.js';
import migration from '../../src/migrations/0013_phone_e164_backfill.js';

let mongod;

test.before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'phone_migration_qa' });
});

test.after(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

const seed = async () => {
    await User.collection.deleteMany({});
    await Vendor.collection.deleteMany({});

    await User.collection.insertMany([
        { name: 'Bare national', email: 'a@x.com', password: 'x', phone: '9876543210' },
        { name: 'Already E164', email: 'b@x.com', password: 'x', phone: '9876500001', phoneE164: '+919876500001' },
        // Duplicate of the first number — legitimate today, must not fail the run.
        { name: 'Duplicate', email: 'c@x.com', password: 'x', phone: '9876543210' },
        { name: 'Unnormalisable', email: 'd@x.com', password: 'x', phone: 'not-a-phone' },
        { name: 'Empty phone', email: 'e@x.com', password: 'x', phone: '' },
        { name: 'No phone field', email: 'f@x.com', password: 'x' },
        { name: 'Trunk zero', email: 'g@x.com', password: 'x', phone: '09876500002' },
    ]);

    await Vendor.collection.insertMany([
        { name: 'V1', email: 'v1@x.com', password: 'x', storeName: 'S1', phone: '9000000001' },
    ]);
};

test('backfill derives E.164 without touching the legacy phone field', async () => {
    await seed();
    await migration.up();

    const bare = await User.collection.findOne({ email: 'a@x.com' });
    assert.equal(bare.phoneE164, '+919876543210');
    assert.equal(bare.phone, '9876543210', 'legacy phone must be preserved verbatim');

    const trunk = await User.collection.findOne({ email: 'g@x.com' });
    assert.equal(trunk.phoneE164, '+919876500002');
    assert.equal(trunk.phone, '09876500002');

    const vendor = await Vendor.collection.findOne({ email: 'v1@x.com' });
    assert.equal(vendor.phoneE164, '+919000000001');
});

test('duplicate phone numbers are backfilled, not rejected', async () => {
    const dupes = await User.collection.find({ phoneE164: '+919876543210' }).toArray();
    assert.equal(dupes.length, 2, 'both duplicate accounts must be backfilled');
});

test('unusable phone values are left null rather than guessed at', async () => {
    for (const email of ['d@x.com', 'e@x.com', 'f@x.com']) {
        const doc = await User.collection.findOne({ email });
        assert.ok(!doc.phoneE164, `${email} must not receive a fabricated phoneE164`);
    }
    // The account still exists and is untouched otherwise.
    const bad = await User.collection.findOne({ email: 'd@x.com' });
    assert.equal(bad.phone, 'not-a-phone');
});

test('phoneVerified is NOT set by the migration', async () => {
    // A self-declared registration field has never been proven to belong to the
    // account holder, and password reset trusts this flag.
    const doc = await User.collection.findOne({ email: 'a@x.com' });
    assert.notEqual(doc.phoneVerified, true);
});

test('migration is idempotent — a second run writes nothing', async () => {
    const before = await User.collection.find({}).sort({ email: 1 }).toArray();
    await migration.up();
    const after = await User.collection.find({}).sort({ email: 1 }).toArray();
    assert.deepEqual(
        after.map((d) => [d.email, d.phone ?? null, d.phoneE164 ?? null]),
        before.map((d) => [d.email, d.phone ?? null, d.phoneE164 ?? null]),
    );
});

test('an already-valid phoneE164 is never overwritten', async () => {
    const doc = await User.collection.findOne({ email: 'b@x.com' });
    assert.equal(doc.phoneE164, '+919876500001');
});

test('verify() reports ok and creates no unique index', async () => {
    const result = await migration.verify();
    assert.equal(result.ok, true, `verify failed: ${result.detail}`);

    const indexes = await User.collection.indexes();
    const uniquePhone = indexes.find((i) => i.unique && (i.key.phone || i.key.phoneE164));
    assert.equal(uniquePhone, undefined, 'migration must not create a unique phone index');
});

test('verify() fails loudly on a malformed phoneE164', async () => {
    await User.collection.insertOne({ name: 'Bad', email: 'z@x.com', password: 'x', phoneE164: '919876543210' });
    const result = await migration.verify();
    assert.equal(result.ok, false, 'malformed E.164 must be reported as a failure');
    await User.collection.deleteOne({ email: 'z@x.com' });
});
