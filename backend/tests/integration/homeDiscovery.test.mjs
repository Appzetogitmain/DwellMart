import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    startHarness, stopHarness, resetDatabase, get,
    seedVendor, seedCategory, seedProduct,
} from './helpers/harness.mjs';

let ids;

before(async () => {
    await startHarness();
    await resetDatabase();
    const { default: Product } = await import('../../src/models/Product.model.js');
    const { default: Campaign } = await import('../../src/models/Campaign.model.js');
    const vendor = await seedVendor();
    const paused = await seedVendor({ channels: { retail: 'paused' } });
    const category = await seedCategory();
    const flagged = await seedProduct({ vendorId: vendor._id, categoryId: category._id, name: 'Flagged arrival' });
    const ordinary = await seedProduct({ vendorId: vendor._id, categoryId: category._id, name: 'Unflagged arrival' });
    const daily = await seedProduct({ vendorId: vendor._id, categoryId: category._id, name: 'Daily campaign product' });
    const flash = await seedProduct({ vendorId: vendor._id, categoryId: category._id, name: 'Flash flag product' });
    const flashCampaign = await seedProduct({ vendorId: vendor._id, categoryId: category._id, name: 'Flash campaign product' });
    const hidden = await seedProduct({ vendorId: paused._id, categoryId: category._id, name: 'Paused vendor campaign product' });
    await Product.updateOne({ _id: flagged._id }, { $set: { isNewArrival: true } });
    await Product.updateOne({ _id: flash._id }, { $set: { flashSale: true } });
    const now = Date.now();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    await Campaign.create({
        name: 'Daily campaign', slug: 'home-daily-campaign', type: 'daily_deal', isActive: true,
        startDate: new Date(now - 60_000), endDate: today,
        productIds: [daily._id, hidden._id],
    });
    await Campaign.create({
        name: 'Flash campaign', slug: 'home-flash-campaign', type: 'flash_sale', isActive: true,
        startDate: new Date(now - 60_000), endDate: new Date(now + 3_600_000),
        productIds: [flashCampaign._id],
    });
    ids = { flagged: String(flagged._id), ordinary: String(ordinary._id), daily: String(daily._id), flash: String(flash._id), flashCampaign: String(flashCampaign._id), hidden: String(hidden._id) };
});

after(async () => { await stopHarness(); });

test('daily deals expose only active campaign products from eligible vendors', async () => {
    const res = await get('/api/daily-deals');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.map((item) => String(item._id)), [ids.daily]);
    assert.ok(Date.parse(res.body.data[0].dealEndsAt) > Date.now());
});

test('new arrivals backfill and paginate without blank or duplicate pages', async () => {
    const first = await get('/api/new-arrivals?limit=1&page=1');
    const second = await get('/api/new-arrivals?limit=1&page=2');
    const third = await get('/api/new-arrivals?limit=1&page=3');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.products[0]._id, ids.flagged);
    assert.equal(first.body.data.total, 3);
    assert.equal(first.body.data.pages, 3);
    const idsAcrossPages = [first, second, third].map((res) => String(res.body.data.products[0]._id));
    assert.equal(new Set(idsAcrossPages).size, 3);
    assert.ok(idsAcrossPages.includes(ids.ordinary));
    assert.ok(idsAcrossPages.includes(ids.flash));
});

test('flash sale still includes flagged products and excludes paused sellers', async () => {
    const res = await get('/api/flash-sale');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const productIds = res.body.data.map((item) => String(item._id));
    assert.ok(productIds.includes(ids.flash));
    assert.ok(productIds.includes(ids.flashCampaign));
    assert.ok(!productIds.includes(ids.hidden));
});

test('campaign detail uses the same public product eligibility as deal listings', async () => {
    const list = await get('/api/campaigns?type=daily_deal');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.data.some((campaign) => campaign.slug === 'home-daily-campaign'));
    const res = await get('/api/campaigns/home-daily-campaign');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.products.map((item) => String(item._id)), [ids.daily]);
});
