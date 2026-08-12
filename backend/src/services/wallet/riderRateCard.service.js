/**
 * riderRateCard.service
 *
 * Resolves which rate card applies to a delivery, and computes the earning.
 *
 * Deliberately has NO fallback rate. If no card matches, the caller is told so
 * and no earning is written. A hardcoded default here would be an unaudited
 * financial commitment that nobody approved and nobody can see in the admin UI.
 */

import mongoose from 'mongoose';
import RiderRateCard from '../../models/RiderRateCard.model.js';
import { roundMoney } from '../PriceReconciliationService.js';
import { EXPERIENCES } from '../../constants/experiences.js';

export const ensureDefaultRateCard = async () => {
    try {
        let card = await RiderRateCard.findOne({ scope: 'global', isActive: true });
        if (!card) {
            card = await RiderRateCard.create({
                name: 'Default Quick Commerce Rate Card',
                scope: 'global',
                baseFarePerDelivery: 30,
                perKmRate: 6,
                freeDistanceKm: 1,
                minimumFare: 35,
                effectiveFrom: new Date('2026-01-01'),
                isActive: true,
                notes: 'Default platform rate card for Quick Commerce deliveries',
            });
            console.log(`[RiderRateCard] Ensured default global rate card: ${card.name} (${card._id})`);
        }
        return card;
    } catch (err) {
        console.error(`[RiderRateCard] Error ensuring default rate card: ${err.message}`);
        return null;
    }
};

/**
 * Resolve the applicable rate card, most specific scope first.
 *
 * @param {object} params
 * @param {string} [params.deliveryBoyId]
 * @param {string} [params.city]
 * @param {string} [params.experience]
 * @param {Date}   [params.at]  Point in time to resolve for; defaults to now.
 * @returns {Promise<object|null>}
 */
export const resolveRateCard = async ({
    deliveryBoyId = null,
    city = null,
    experience = null,
    at = new Date(),
} = {}) => {
    const effectivityWindow = {
        isActive: true,
        effectiveFrom: { $lte: at },
        $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gt: at } }],
    };

    const candidates = [];

    if (deliveryBoyId && mongoose.isValidObjectId(deliveryBoyId)) {
        candidates.push({ ...effectivityWindow, scope: 'rider', deliveryBoyId });
    }

    const trimmedCity = String(city || '').trim();
    if (trimmedCity) {
        candidates.push({
            ...effectivityWindow,
            scope: 'city',
            city: new RegExp(`^${trimmedCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });
    }

    if (experience) {
        candidates.push({ ...effectivityWindow, scope: 'experience', experience });
    }

    candidates.push({ ...effectivityWindow, scope: 'global' });

    for (const filter of candidates) {
        // Newest effective card wins within a scope, so a scheduled change
        // supersedes its predecessor the moment it becomes effective.
        const card = await RiderRateCard.findOne(filter).sort({ effectiveFrom: -1 }).lean();
        if (card) return card;
    }

    return null;
};

/** Is `date` inside any configured peak window on this card? */
const isPeakHour = (card, date) => {
    const windows = Array.isArray(card?.peakHours) ? card.peakHours : [];
    if (windows.length === 0) return false;

    const hour = date.getHours();
    return windows.some(({ startHour, endHour }) => {
        const start = Number(startHour);
        const end = Number(endHour);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
        // Overnight windows (e.g. 22 → 2) wrap past midnight.
        return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
    });
};

/**
 * Compute a delivery earning from a resolved card.
 *
 * Order of operations is fixed and must not be reordered casually — the minimum
 * fare floors base + distance only, so a peak bonus is genuinely additional
 * rather than being swallowed by the floor.
 *
 *   base
 *   + max(0, distanceKm - freeDistanceKm) x perKmRate
 *   → floor at minimumFare
 *   x surgeMultiplier
 *   + peakHourBonus (when applicable)
 *   + codHandlingFee (COD orders only)
 *   → cap at maximumFare (when set)
 *
 * @returns {{amount: number, breakdown: object}}
 */
export const computeDeliveryEarning = ({
    card,
    distanceKm = 0,
    isCod = false,
    experience = EXPERIENCES.MARKETPLACE,
    completedAt = new Date(),
}) => {
    if (!card) throw new Error('computeDeliveryEarning requires a resolved rate card.');

    const baseFare = roundMoney(card.baseFarePerDelivery || 0);
    const perKmRate = roundMoney(card.perKmRate || 0);
    const freeDistanceKm = Number(card.freeDistanceKm || 0);

    const safeDistance = Number.isFinite(Number(distanceKm)) && Number(distanceKm) > 0
        ? Number(distanceKm)
        : 0;
    const chargeableKm = Math.max(0, safeDistance - freeDistanceKm);
    const distanceFare = roundMoney(chargeableKm * perKmRate);

    let subtotal = roundMoney(baseFare + distanceFare);

    const minimumFare = roundMoney(card.minimumFare || 0);
    const minimumFareApplied = minimumFare > 0 && subtotal < minimumFare;
    if (minimumFareApplied) subtotal = minimumFare;

    const surgeMultiplier = Number(card.surgeMultiplier) >= 1 ? Number(card.surgeMultiplier) : 1;
    const surgedSubtotal = roundMoney(subtotal * surgeMultiplier);
    const surgeAmount = roundMoney(surgedSubtotal - subtotal);

    const peakApplies = isPeakHour(card, new Date(completedAt));
    const peakHourBonus = peakApplies ? roundMoney(card.peakHourBonus || 0) : 0;

    const codHandlingFee = isCod ? roundMoney(card.codHandlingFee || 0) : 0;

    let total = roundMoney(surgedSubtotal + peakHourBonus + codHandlingFee);

    const maximumFare = roundMoney(card.maximumFare || 0);
    if (maximumFare > 0 && total > maximumFare) total = maximumFare;

    return {
        amount: total,
        breakdown: {
            rateCardId: card._id,
            rateCardName: card.name || '',
            baseFare,
            distanceKm: roundMoney(safeDistance),
            perKmRate,
            distanceFare,
            surgeMultiplier,
            surgeAmount,
            peakHourBonus,
            codHandlingFee,
            minimumFareApplied,
            experience: String(experience || ''),
        },
    };
};
