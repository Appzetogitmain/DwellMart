import VendorShippingZone from '../models/VendorShippingZone.model.js';
import VendorShippingRate from '../models/VendorShippingRate.model.js';
import Settings from '../models/Settings.model.js';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const pickRateByMethod = (rates = [], shippingOption = 'standard') => {
    if (!rates.length) return null;
    const option = normalizeText(shippingOption);
    const direct = rates.find((rate) => normalizeText(rate?.name).includes(option));
    if (direct) return direct;

    if (option === 'express') {
        const expressLike = rates.find((rate) => normalizeText(rate?.name).includes('express'));
        if (expressLike) return expressLike;
    }

    if (option === 'standard') {
        const standardLike = rates.find((rate) => normalizeText(rate?.name).includes('standard'));
        if (standardLike) return standardLike;
    }

    return rates[0];
};

export const calculateVendorShippingForGroups = async ({
    vendorGroups = [],
    shippingAddress = {},
    shippingOption = 'standard',
    couponType = null,
}) => {
    const groups = Array.isArray(vendorGroups) ? vendorGroups : [];
    if (!groups.length) {
        return { totalShipping: 0, shippingByVendor: {} };
    }

    if (normalizeText(couponType) === 'freeship') {
        const freeMap = groups.reduce((acc, group) => {
            acc[String(group.vendorId)] = 0;
            return acc;
        }, {});
        return { totalShipping: 0, shippingByVendor: freeMap };
    }

    // Fetch platform-level admin shipping settings as single source of truth for platform defaults
    let platformFreeThreshold = 1000;
    let platformDefaultRate = 65;
    try {
        const platformSettingDoc = await Settings.findOne({ key: 'shipping' }).lean();
        if (platformSettingDoc?.value) {
            if (platformSettingDoc.value.freeShippingThreshold !== undefined && platformSettingDoc.value.freeShippingThreshold !== '') {
                platformFreeThreshold = Math.max(0, toNumber(platformSettingDoc.value.freeShippingThreshold, 1000));
            }
            if (platformSettingDoc.value.defaultShippingRate !== undefined && platformSettingDoc.value.defaultShippingRate !== '') {
                platformDefaultRate = Math.max(0, toNumber(platformSettingDoc.value.defaultShippingRate, 65));
            }
        }
    } catch (err) {
        // Safe fallback
    }

    const vendorIds = [...new Set(groups.map((group) => String(group.vendorId || '')).filter(Boolean))];
    const [zones, rates] = await Promise.all([
        VendorShippingZone.find({ vendorId: { $in: vendorIds } }).select('vendorId countries').lean(),
        VendorShippingRate.find({ vendorId: { $in: vendorIds } }).select('vendorId zoneId name rate freeShippingThreshold').lean(),
    ]);

    const zonesByVendor = new Map();
    zones.forEach((zone) => {
        const key = String(zone.vendorId);
        if (!zonesByVendor.has(key)) zonesByVendor.set(key, []);
        zonesByVendor.get(key).push(zone);
    });

    const ratesByVendor = new Map();
    rates.forEach((rate) => {
        const key = String(rate.vendorId);
        if (!ratesByVendor.has(key)) ratesByVendor.set(key, []);
        ratesByVendor.get(key).push(rate);
    });

    const shippingByVendor = {};
    const shippingCountry = normalizeText(shippingAddress?.country);

    groups.forEach((group) => {
        const vendorId = String(group.vendorId || '');
        const subtotal = Math.max(0, toNumber(group.subtotal, 0));
        const shippingEnabled = group.shippingEnabled !== false;

        if (!shippingEnabled) {
            shippingByVendor[vendorId] = 0;
            return;
        }

        const vendorZones = zonesByVendor.get(vendorId) || [];
        const vendorRates = ratesByVendor.get(vendorId) || [];

        let matchedZone = null;
        if (shippingCountry) {
            matchedZone = vendorZones.find((zone) =>
                Array.isArray(zone.countries) &&
                zone.countries.some((country) => normalizeText(country) === shippingCountry)
            );
        }
        if (!matchedZone) {
            matchedZone = vendorZones.find((zone) => !Array.isArray(zone.countries) || zone.countries.length === 0) || null;
        }

        const candidateRates = matchedZone
            ? vendorRates.filter((rate) => String(rate.zoneId) === String(matchedZone._id))
            : vendorRates;
        const chosenRate = pickRateByMethod(candidateRates, shippingOption);

        if (chosenRate) {
            const rateThreshold = toNumber(chosenRate.freeShippingThreshold, 0);
            const effectiveThreshold = rateThreshold > 0 ? rateThreshold : platformFreeThreshold;
            if (effectiveThreshold > 0 && subtotal >= effectiveThreshold) {
                shippingByVendor[vendorId] = 0;
            } else {
                shippingByVendor[vendorId] = Math.max(0, toNumber(chosenRate.rate, 0));
            }
            return;
        }

        // Platform-level Admin rules govern standard marketplace shipping
        if (platformFreeThreshold > 0 && subtotal >= platformFreeThreshold) {
            shippingByVendor[vendorId] = 0;
            return;
        }

        const fallbackStandard = platformDefaultRate;
        shippingByVendor[vendorId] = normalizeText(shippingOption) === 'express'
            ? (fallbackStandard * 2)
            : fallbackStandard;
    });

    const totalShipping = Number(
        Object.values(shippingByVendor).reduce((sum, amount) => sum + toNumber(amount, 0), 0).toFixed(2)
    );

    return { totalShipping, shippingByVendor };
};

