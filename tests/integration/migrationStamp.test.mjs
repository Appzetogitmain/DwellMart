/**
 * Migration 0010 against a replica of the real production vendor state.
 *
 * Reproduces the exact shapes measured on the live database before 0010:
 *   58 vendors holding real channel state      (0008 processed them)
 *   12 rejected vendors, all channels disabled (0008 processed them)
 *    4 vendors at channelsRevision 0           (0008 SKIPPED them)
 *    0 stamped with channelMigrationVersion
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, stopHarness, resetDatabase, getMongoose } from './helpers/harness.mjs';
import m0008 from '../../src/migrations/0008_vendor_channels.js';
import m0010, { classifyVendorForStamp } from '../../src/migrations/0010_vendor_channel_migration_stamp.js';

let Vendor;

before(async () => {
    await startHarness();
    await resetDatabase();
    Vendor = getMongoose().model('Vendor');
});

after(async () => { await stopHarness(); });

const disabledChannel = () => ({ status: 'disabled', requestedAt: null, activatedAt: null, pausedAt: null, rejectedAt: null, disabledAt: null, reviewedAt: null, reviewedBy: null, requestedBy: null, reason: '' });

/** Insert raw so we bypass schema defaults and reproduce historical documents. */
const insertRaw = (doc) => Vendor.collection.insertOne({
    name: doc.email, email: doc.email, password: 'x', storeName: doc.email,
    createdAt: new Date(), updatedAt: new Date(), __v: 0,
    ...doc,
});

test('0010 classifier: a vendor holding a real channel is stamp-only', () => {
    assert.equal(classifyVendorForStamp({ channels: { retail: { status: 'active' } }, channelsRevision: 1 }), 'stamp');
});

test('0010 classifier: a rejected vendor with all channels disabled but rev>=1 is stamp-only', () => {
    assert.equal(classifyVendorForStamp({
        channels: { retail: disabledChannel(), wholesale: disabledChannel(), quickCommerce: disabledChannel() },
        channelsRevision: 1,
    }), 'stamp');
});

test('0010 classifier: a vendor still at the schema default is backfilled', () => {
    assert.equal(classifyVendorForStamp({
        channels: { retail: disabledChannel(), wholesale: disabledChannel(), quickCommerce: disabledChannel() },
        channelsRevision: 0,
    }), 'backfill');
});

test('0010 classifier: an admin decision that disabled everything is never undone', () => {
    assert.equal(classifyVendorForStamp({
        channels: {
            retail: { ...disabledChannel(), reviewedAt: new Date(), reviewedBy: 'admin1' },
            wholesale: disabledChannel(),
            quickCommerce: disabledChannel(),
        },
        channelsRevision: 0,
    }), 'stamp');
});

test('0010 repairs only the vendors 0008 skipped, and stamps the rest', async () => {
    // 0008-processed: real channel state
    await insertRaw({
        email: 'processed-active@test.local', status: 'approved', isActive: true, isVerified: true,
        vendorType: 'retail', channelsRevision: 1,
        sellingChannels: { retail: { enabled: true }, wholesale: { enabled: false }, quickCommerce: { enabled: false } },
        channels: { retail: { ...disabledChannel(), status: 'active' }, wholesale: disabledChannel(), quickCommerce: disabledChannel() },
    });
    // 0008-processed: rejected account, legitimately all-disabled
    await insertRaw({
        email: 'processed-rejected@test.local', status: 'rejected', isActive: false, isVerified: true,
        vendorType: 'retail', channelsRevision: 1,
        sellingChannels: { retail: { enabled: false }, wholesale: { enabled: false }, quickCommerce: { enabled: false } },
        channels: { retail: disabledChannel(), wholesale: disabledChannel(), quickCommerce: disabledChannel() },
    });
    // 0008-SKIPPED: schema defaults only
    await insertRaw({
        email: 'skipped@test.local', status: 'approved', isActive: true, isVerified: false,
        vendorType: 'retail', channelsRevision: 0,
        sellingChannels: { retail: { enabled: false }, wholesale: { enabled: false }, quickCommerce: { enabled: false } },
        channels: { retail: disabledChannel(), wholesale: disabledChannel(), quickCommerce: disabledChannel() },
    });

    const result = await m0010.up();
    assert.equal(result.stampedOnly, 2, 'both processed vendors stamped without data change');
    assert.equal(result.backfilled, 1, 'only the skipped vendor is backfilled');

    const processedRejected = await Vendor.collection.findOne({ email: 'processed-rejected@test.local' });
    assert.equal(processedRejected.channels.retail.status, 'disabled', 'a rejected vendor must not be granted a channel');
    assert.equal(processedRejected.channelMigrationVersion, 1);

    const repaired = await Vendor.collection.findOne({ email: 'skipped@test.local' });
    assert.equal(repaired.channels.retail.status, 'active', 'skipped vendor receives the backfill 0008 owed it');
    assert.equal(repaired.channelsRevision, 1);
    assert.equal(repaired.channelMigrationVersion, 1);

    const verify = await m0010.verify();
    assert.equal(verify.ok, true, verify.detail);
});

test('0010 is idempotent — a second run changes nothing', async () => {
    const before2 = await Vendor.collection.find({}).toArray();
    const result = await m0010.up();
    assert.equal(result.stampedOnly, 0);
    assert.equal(result.backfilled, 0);
    const after2 = await Vendor.collection.find({}).toArray();
    assert.equal(before2.length, after2.length);
    for (let i = 0; i < before2.length; i += 1) {
        assert.equal(before2[i].channels.retail.status, after2[i].channels.retail.status);
        assert.equal(before2[i].channelsRevision, after2[i].channelsRevision);
    }
});

test('0008 verify passes once 0010 has stamped every vendor', async () => {
    const verify = await m0008.verify();
    assert.equal(verify.ok, true, verify.detail);
});

test('on a fresh database 0008 stamps everything and 0010 is a no-op', async () => {
    await resetDatabase();
    await insertRaw({
        email: 'fresh@test.local', status: 'approved', isActive: true, isVerified: true,
        vendorType: 'wholesale', channelsRevision: 0,
        sellingChannels: { retail: { enabled: false }, wholesale: { enabled: true }, quickCommerce: { enabled: false } },
        channels: { retail: disabledChannel(), wholesale: disabledChannel(), quickCommerce: disabledChannel() },
    });

    const r8 = await m0008.up();
    assert.equal(r8.migrated, 1);
    const fresh = await Vendor.collection.findOne({ email: 'fresh@test.local' });
    assert.equal(fresh.channels.wholesale.status, 'active');
    assert.equal(fresh.channelMigrationVersion, 1);

    const r10 = await m0010.up();
    assert.equal(r10.stampedOnly, 0);
    assert.equal(r10.backfilled, 0);

    assert.equal((await m0008.verify()).ok, true);
    assert.equal((await m0010.verify()).ok, true);
});
