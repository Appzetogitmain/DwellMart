/**
 * RiderRateCard
 *
 * What the platform pays a delivery partner per completed delivery.
 *
 * Rate cards are SUPERSEDED, never edited. Changing a live card in place would
 * silently rewrite what past deliveries were worth; instead a new card is
 * created with a later `effectiveFrom` and the previous one is closed off. Every
 * earning also carries a frozen copy of the resolved inputs
 * (`RiderWalletTransaction.earningBreakdown`), so a historical payout stays
 * explainable even if every card is later deleted.
 *
 * Resolution precedence, most specific first:
 *   rider → city → experience → global
 * The first active card whose scope matches and whose effective window contains
 * `now` wins. A platform with no cards configured pays nothing and says so
 * loudly — there is deliberately no built-in default rate, because a silent
 * fallback rate is an unaudited financial commitment.
 */

import mongoose from 'mongoose';
import { EXPERIENCE_VALUES } from '../constants/experiences.js';

export const RATE_CARD_SCOPES = ['global', 'experience', 'city', 'rider'];

const riderRateCardSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },

        scope: {
            type: String,
            enum: RATE_CARD_SCOPES,
            default: 'global',
            required: true,
            index: true,
        },

        /** Required when scope === 'experience'. */
        experience: {
            type: String,
            enum: [...EXPERIENCE_VALUES, null],
            default: null,
        },

        /** Required when scope === 'city'. Matched case-insensitively. */
        city: { type: String, trim: true, default: null },

        /** Required when scope === 'rider'. */
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy',
            default: null,
            index: true,
        },

        // ── Fare components ──────────────────────────────────────────────────
        baseFarePerDelivery: { type: Number, required: true, min: 0, default: 0 },
        perKmRate: { type: Number, min: 0, default: 0 },

        /** Distance below this is included in the base fare. */
        freeDistanceKm: { type: Number, min: 0, default: 0 },

        /** Floor applied after base + distance, before bonuses. */
        minimumFare: { type: Number, min: 0, default: 0 },

        /** Ceiling on a single delivery's earning; 0 disables the cap. */
        maximumFare: { type: Number, min: 0, default: 0 },

        surgeMultiplier: { type: Number, min: 1, default: 1 },

        /** Flat bonus applied when delivery completes inside a peak window. */
        peakHourBonus: { type: Number, min: 0, default: 0 },
        peakHours: [
            {
                _id: false,
                startHour: { type: Number, min: 0, max: 23 },
                endHour: { type: Number, min: 0, max: 23 },
            },
        ],

        /** Extra paid for handling cash on a COD order. */
        codHandlingFee: { type: Number, min: 0, default: 0 },

        // ── Effectivity ──────────────────────────────────────────────────────
        effectiveFrom: { type: Date, required: true, default: Date.now, index: true },
        effectiveTo: { type: Date, default: null },
        isActive: { type: Boolean, default: true, index: true },

        notes: { type: String, trim: true, default: '' },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderRateCard', default: null },
    },
    { timestamps: true }
);

// Resolution query: active cards for a scope, newest effective first.
riderRateCardSchema.index({ scope: 1, isActive: 1, effectiveFrom: -1 });
riderRateCardSchema.index({ scope: 1, city: 1, isActive: 1, effectiveFrom: -1 });
riderRateCardSchema.index({ scope: 1, experience: 1, isActive: 1, effectiveFrom: -1 });
riderRateCardSchema.index({ scope: 1, deliveryBoyId: 1, isActive: 1, effectiveFrom: -1 });

/** Reject scope/target combinations that could never resolve. */
riderRateCardSchema.pre('validate', function validateScopeTarget(next) {
    if (this.scope === 'experience' && !this.experience) {
        return next(new Error('An experience-scoped rate card requires an experience.'));
    }
    if (this.scope === 'city' && !String(this.city || '').trim()) {
        return next(new Error('A city-scoped rate card requires a city.'));
    }
    if (this.scope === 'rider' && !this.deliveryBoyId) {
        return next(new Error('A rider-scoped rate card requires a delivery partner.'));
    }
    if (this.effectiveTo && this.effectiveFrom && this.effectiveTo <= this.effectiveFrom) {
        return next(new Error('effectiveTo must be later than effectiveFrom.'));
    }
    return next();
});

const RiderRateCard = mongoose.model('RiderRateCard', riderRateCardSchema);

export { RiderRateCard };
export default RiderRateCard;
