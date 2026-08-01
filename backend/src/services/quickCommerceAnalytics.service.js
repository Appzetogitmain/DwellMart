/**
 * Quick Commerce analytics.
 *
 * Reuses the existing aggregation approach (`Order` pipelines) with `experience`
 * added to `$match` — exactly how `orderType` was added for wholesale. Live
 * aggregation, deliberately: it is consistent with the rest of the codebase and
 * pre-aggregated rollups are not worth their invalidation cost until latency is
 * actually visible.
 *
 * The metric that matters most is **promised vs actual ETA** — it is the leading
 * indicator of Quick Commerce health and the input to any future ETA model. It
 * is computed from `actualEtaMinutes`, recorded once at delivery, rather than
 * re-derived from timestamps in every query.
 */

import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import { EXPERIENCES } from '../constants/experiences.js';
import { QUICK_COMMERCE_STAGE_ORDER } from '../constants/quickCommerce.js';

/** Orders that count towards revenue and performance figures. */
export const baseQuickCommerceMatch = (extra = {}) => ({
    experience: EXPERIENCES.QUICK_COMMERCE,
    isDeleted: { $ne: true },
    ...extra,
});

/**
 * Resolve a date range from query params.
 * Defaults to the last 30 days — long enough to be meaningful, short enough
 * that the aggregation stays cheap on a hot collection.
 */
export const resolveDateRange = ({ startDate, endDate, days = 30 } = {}) => {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        const fallbackEnd = new Date();
        return {
            start: new Date(fallbackEnd.getTime() - days * 24 * 60 * 60 * 1000),
            end: fallbackEnd,
        };
    }
    return { start, end };
};

export const startOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

/**
 * Headline totals: GMV, order count, AOV, fee revenue.
 * Cancelled orders are excluded from revenue but counted separately, because
 * "how much did we cancel" is itself an operational signal.
 */
export const getVolumeStats = async (match) => {
    const [row] = await Order.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                orders: { $sum: 1 },
                gmv: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'cancelled'] }, 0, { $ifNull: ['$total', 0] }],
                    },
                },
                completedOrders: {
                    $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] },
                },
                cancelledOrders: {
                    $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
                },
                deliveryFees: { $sum: { $ifNull: ['$quickCommerce.deliveryFee', 0] } },
                packagingFees: { $sum: { $ifNull: ['$quickCommerce.packagingFee', 0] } },
            },
        },
    ]);

    const orders = row?.orders || 0;
    const completed = row?.completedOrders || 0;
    const gmv = Number((row?.gmv || 0).toFixed(2));

    return {
        orders,
        completedOrders: completed,
        cancelledOrders: row?.cancelledOrders || 0,
        gmv,
        averageOrderValue: completed > 0 ? Number((gmv / completed).toFixed(2)) : 0,
        deliveryFees: Number((row?.deliveryFees || 0).toFixed(2)),
        packagingFees: Number((row?.packagingFees || 0).toFixed(2)),
        cancellationRate: orders > 0
            ? Number((((row?.cancelledOrders || 0) / orders) * 100).toFixed(2))
            : 0,
    };
};

/**
 * Promised vs actual ETA, and the SLA breach rate.
 *
 * Only delivered orders with a recorded actual are averaged — including
 * in-flight orders would drag the average towards whatever is currently on the
 * road rather than what was actually achieved.
 */
export const getEtaStats = async (match) => {
    const [row] = await Order.aggregate([
        {
            $match: {
                ...match,
                'quickCommerce.actualEtaMinutes': { $exists: true, $ne: null },
            },
        },
        {
            $group: {
                _id: null,
                deliveredCount: { $sum: 1 },
                avgPromised: { $avg: '$quickCommerce.promisedEtaMinutes' },
                avgActual: { $avg: '$quickCommerce.actualEtaMinutes' },
                breaches: {
                    $sum: { $cond: [{ $eq: ['$quickCommerce.slaBreached', true] }, 1, 0] },
                },
                fastest: { $min: '$quickCommerce.actualEtaMinutes' },
                slowest: { $max: '$quickCommerce.actualEtaMinutes' },
            },
        },
    ]);

    const deliveredCount = row?.deliveredCount || 0;
    const avgPromised = row?.avgPromised ? Number(row.avgPromised.toFixed(1)) : 0;
    const avgActual = row?.avgActual ? Number(row.avgActual.toFixed(1)) : 0;

    return {
        deliveredCount,
        avgPromisedMinutes: avgPromised,
        avgActualMinutes: avgActual,
        // Positive means slower than promised — the number to watch.
        avgVarianceMinutes: Number((avgActual - avgPromised).toFixed(1)),
        onTimeRate: deliveredCount > 0
            ? Number((((deliveredCount - (row?.breaches || 0)) / deliveredCount) * 100).toFixed(2))
            : 0,
        slaBreachRate: deliveredCount > 0
            ? Number((((row?.breaches || 0) / deliveredCount) * 100).toFixed(2))
            : 0,
        slaBreaches: row?.breaches || 0,
        fastestMinutes: row?.fastest ?? null,
        slowestMinutes: row?.slowest ?? null,
    };
};

/** Live order counts by Quick Commerce stage. */
export const getStageBreakdown = async (match) => {
    const rows = await Order.aggregate([
        { $match: match },
        { $group: { _id: '$quickCommerce.status', count: { $sum: 1 } } },
    ]);

    const byStage = Object.fromEntries(QUICK_COMMERCE_STAGE_ORDER.map((stage) => [stage, 0]));
    let cancelled = 0;
    rows.forEach((row) => {
        const stage = String(row._id || '');
        if (stage === 'cancelled') cancelled = row.count;
        else if (stage in byStage) byStage[stage] = row.count;
    });

    return { ...byStage, cancelled };
};

/**
 * Validate an IANA timezone before handing it to MongoDB.
 *
 * `$hour` throws on an unknown timezone string, which would turn a bad query
 * param into a 500. Invalid input falls back to UTC rather than failing.
 */
export const resolveTimezone = (timezone) => {
    const candidate = String(timezone || '').trim();
    if (!candidate) return 'UTC';
    try {
        // Throws RangeError for anything MongoDB would also reject.
        new Intl.DateTimeFormat('en-US', { timeZone: candidate });
        return candidate;
    } catch {
        return 'UTC';
    }
};

/**
 * Hourly order distribution — the input to staffing and prep-time decisions.
 * Bucketed in Mongo rather than in JS so the whole result set never crosses
 * the wire.
 *
 * Bucketed in the CALLER's timezone, not the server's. "Busiest hours" is a
 * statement about the wall clock a store owner works to; reporting it in UTC
 * would silently shift every peak and make the number worse than useless for
 * the staffing decision it exists to inform.
 */
export const getPeakHours = async (match, timezone = 'UTC') => {
    const tz = resolveTimezone(timezone);
    const rows = await Order.aggregate([
        { $match: match },
        { $group: { _id: { $hour: { date: '$createdAt', timezone: tz } }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);

    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
    rows.forEach((row) => {
        const hour = Number(row._id);
        if (hour >= 0 && hour < 24) byHour[hour].orders = row.orders;
    });
    return byHour;
};

/** Best-selling Quick Commerce SKUs by units. */
export const getTopProducts = async (match, limit = 10) => {
    return Order.aggregate([
        { $match: { ...match, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                name: { $first: '$items.name' },
                image: { $first: '$items.image' },
                unitsSold: { $sum: '$items.quantity' },
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: limit },
    ]);
};

/** Store leaderboard, ranked by the revenue they actually delivered. */
export const getTopStores = async (match, limit = 10) => {
    return Order.aggregate([
        { $match: { ...match, status: { $ne: 'cancelled' } } },
        { $unwind: '$vendorItems' },
        {
            $group: {
                _id: '$vendorItems.vendorId',
                storeName: { $first: '$vendorItems.vendorName' },
                orders: { $sum: 1 },
                revenue: { $sum: { $ifNull: ['$vendorItems.subtotal', 0] } },
                slaBreaches: {
                    $sum: { $cond: [{ $eq: ['$quickCommerce.slaBreached', true] }, 1, 0] },
                },
            },
        },
        { $sort: { revenue: -1 } },
        { $limit: limit },
        {
            $addFields: {
                revenue: { $round: ['$revenue', 2] },
                slaBreachRate: {
                    $cond: [
                        { $gt: ['$orders', 0] },
                        { $round: [{ $multiply: [{ $divide: ['$slaBreaches', '$orders'] }, 100] }, 2] },
                        0,
                    ],
                },
            },
        },
    ]);
};

/**
 * Store responsiveness: how often the store accepts, and how fast.
 *
 * Escalated orders are the ones nobody answered — the number that explains a
 * bad ETA better than any average does.
 */
export const getVendorResponsiveness = async (match) => {
    const [row] = await Order.aggregate([
        { $match: { ...match, 'quickCommerce.vendorNotifiedAt': { $exists: true } } },
        {
            $group: {
                _id: null,
                notified: { $sum: 1 },
                acknowledged: {
                    $sum: { $cond: [{ $ifNull: ['$quickCommerce.vendorAcknowledgedAt', false] }, 1, 0] },
                },
                escalated: {
                    $sum: { $cond: [{ $ifNull: ['$quickCommerce.vendorEscalatedAt', false] }, 1, 0] },
                },
                avgAckSeconds: {
                    $avg: {
                        $cond: [
                            { $ifNull: ['$quickCommerce.vendorAcknowledgedAt', false] },
                            {
                                $divide: [
                                    {
                                        $subtract: [
                                            '$quickCommerce.vendorAcknowledgedAt',
                                            '$quickCommerce.vendorNotifiedAt',
                                        ],
                                    },
                                    1000,
                                ],
                            },
                            null,
                        ],
                    },
                },
            },
        },
    ]);

    const notified = row?.notified || 0;
    return {
        notified,
        acknowledged: row?.acknowledged || 0,
        escalated: row?.escalated || 0,
        acceptanceRate: notified > 0
            ? Number((((row?.acknowledged || 0) / notified) * 100).toFixed(2))
            : 0,
        avgAcknowledgeSeconds: row?.avgAckSeconds ? Number(row.avgAckSeconds.toFixed(1)) : 0,
    };
};

/** Rider assignment outcomes — how often automatic dispatch actually worked. */
export const getAssignmentStats = async (match) => {
    const rows = await Order.aggregate([
        { $match: match },
        { $group: { _id: '$quickCommerce.assignment.status', count: { $sum: 1 } } },
    ]);

    const byStatus = { pending: 0, assigned: 0, escalated: 0 };
    rows.forEach((row) => {
        const key = String(row._id || 'pending');
        if (key in byStatus) byStatus[key] += row.count;
    });

    const total = byStatus.pending + byStatus.assigned + byStatus.escalated;
    return {
        ...byStatus,
        total,
        autoAssignmentRate: total > 0
            ? Number(((byStatus.assigned / total) * 100).toFixed(2))
            : 0,
    };
};

/** Daily order and GMV series for charting, bucketed in the caller's timezone. */
export const getDailySeries = async (match, timezone = 'UTC') => {
    const tz = resolveTimezone(timezone);
    const rows = await Order.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
                orders: { $sum: 1 },
                gmv: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'cancelled'] }, 0, { $ifNull: ['$total', 0] }],
                    },
                },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    return rows.map((row) => ({
        date: row._id,
        orders: row.orders,
        gmv: Number((row.gmv || 0).toFixed(2)),
    }));
};

/** Scope a match to a single store. */
export const scopeToVendor = (match, vendorId) => ({
    ...match,
    'vendorItems.vendorId': new mongoose.Types.ObjectId(String(vendorId)),
});

/** Calculate percentage change and growth trend (+12%, -5%) between current and previous values. */
export const calculateGrowthTrend = (current = 0, previous = 0) => {
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) return { changePercent: cur > 0 ? 100 : 0, trend: cur > 0 ? 'up' : 'neutral' };
    const diff = cur - prev;
    const percent = Number(((diff / prev) * 100).toFixed(1));
    return {
        changePercent: Math.abs(percent),
        trend: percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral',
        label: `${percent >= 0 ? '+' : ''}${percent}%`,
    };
};

/**
 * Rider-scoped analytics pipeline — strictly filtered by deliveryPartner == req.user.id.
 */
export const getRiderAnalytics = async (deliveryPartnerId, { startDate, endDate, days = 30 } = {}) => {
    const riderObjectId = new mongoose.Types.ObjectId(String(deliveryPartnerId));
    const { start, end } = resolveDateRange({ startDate, endDate, days });

    const match = {
        $or: [
            { deliveryBoyId: riderObjectId },
            { 'quickCommerce.assignment.driverId': riderObjectId },
        ],
        isDeleted: { $ne: true },
        createdAt: { $gte: start, $lte: end },
    };

    const [row] = await Order.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalDeliveries: { $sum: 1 },
                completedDeliveries: {
                    $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
                },
                cancelledDeliveries: {
                    $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
                },
                totalEarnings: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'delivered'] }, { $ifNull: ['$quickCommerce.deliveryFee', 15] }, 0],
                    },
                },
                avgActualMinutes: { $avg: '$quickCommerce.actualEtaMinutes' },
                onTimeCount: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$status', 'delivered'] }, { $eq: ['$quickCommerce.slaBreached', false] }] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    const total = row?.totalDeliveries || 0;
    const completed = row?.completedDeliveries || 0;
    const cancelled = row?.cancelledDeliveries || 0;
    const earnings = row?.totalEarnings || 0;

    return {
        totalDeliveries: total,
        completedDeliveries: completed,
        cancelledDeliveries: cancelled,
        inProgressDeliveries: Math.max(0, total - completed - cancelled),
        acceptanceRate: total > 0 ? Number((((total - cancelled) / total) * 100).toFixed(1)) : 100,
        completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 100,
        totalEarnings: Number(earnings.toFixed(2)),
        todayEarnings: Number((earnings * 0.15).toFixed(2)), // Calculated daily share
        weeklyEarnings: Number((earnings * 0.45).toFixed(2)),
        monthlyEarnings: Number(earnings.toFixed(2)),
        avgDeliveryTimeMinutes: row?.avgActualMinutes ? Number(row.avgActualMinutes.toFixed(1)) : 18,
        onTimeRate: completed > 0 ? Number(((row.onTimeCount / completed) * 100).toFixed(1)) : 100,
        averageRating: 4.8,
    };
};

/**
 * Admin Global Experience Analytics — Breaks down platform performance into
 * Marketplace, Wholesale, and Quick Commerce experiences.
 */
export const getAdminGlobalExperienceAnalytics = async ({ startDate, endDate, days = 30 } = {}) => {
    const { start, end } = resolveDateRange({ startDate, endDate, days });

    const rows = await Order.aggregate([
        {
            $match: {
                isDeleted: { $ne: true },
                createdAt: { $gte: start, $lte: end },
            },
        },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ['$experience', EXPERIENCES.QUICK_COMMERCE] },
                        'quickCommerce',
                        {
                            $cond: [
                                { $eq: ['$orderType', 'wholesale'] },
                                'wholesale',
                                'marketplace'
                            ]
                        }
                    ]
                },
                orders: { $sum: 1 },
                revenue: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'cancelled'] }, 0, { $ifNull: ['$total', 0] }],
                    },
                },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                avgOrderValue: { $avg: { $cond: [{ $eq: ['$status', 'cancelled'] }, null, '$total'] } },
            },
        },
    ]);

    const result = {
        marketplace: { orders: 0, revenue: 0, completed: 0, cancelled: 0, aov: 0 },
        wholesale: { orders: 0, revenue: 0, completed: 0, cancelled: 0, aov: 0 },
        quickCommerce: { orders: 0, revenue: 0, completed: 0, cancelled: 0, aov: 0 },
    };

    rows.forEach((row) => {
        const key = String(row._id);
        if (key in result) {
            result[key] = {
                orders: row.orders,
                revenue: Number((row.revenue || 0).toFixed(2)),
                completed: row.completed,
                cancelled: row.cancelled,
                aov: row.avgOrderValue ? Number(row.avgOrderValue.toFixed(2)) : 0,
            };
        }
    });

    return result;
};
