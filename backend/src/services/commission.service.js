import Commission from '../models/Commission.model.js';
import Vendor from '../models/Vendor.model.js';
import Settings from '../models/Settings.model.js';

/**
 * Vendor financial policy, read from settings rather than compiled in.
 *
 * The escrow period, minimum payout and default commission rate are commercial
 * decisions. Each was previously a literal — the commission rate in three
 * separate places, free to drift — so changing any of them required a deploy.
 * Defaults reproduce the previous hardcoded values exactly, so behaviour is
 * unchanged until an operator deliberately changes them.
 */
const VENDOR_FINANCE_DEFAULTS = {
    escrowDays: 7,
    minimumPayout: 500,
    defaultCommissionRate: 10,
};

const readVendorFinanceSetting = async (key) => {
    try {
        const doc = await Settings.findOne({ key: 'vendor_finance' }).lean();
        const value = Number(doc?.value?.[key]);
        return Number.isFinite(value) && value >= 0 ? value : VENDOR_FINANCE_DEFAULTS[key];
    } catch {
        return VENDOR_FINANCE_DEFAULTS[key];
    }
};

export const getVendorEscrowDays = () => readVendorFinanceSetting('escrowDays');
export const getMinimumPayout = () => readVendorFinanceSetting('minimumPayout');
export const getDefaultCommissionRate = () => readVendorFinanceSetting('defaultCommissionRate');

/**
 * Order fulfilment policy — return windows and the delivery estimate.
 *
 * These are customer-facing commitments and, for returns, a consumer-protection
 * position. They were literals inside the order controller, so changing a
 * returns policy required a code deploy. Defaults reproduce the previous values
 * exactly.
 */
const FULFILMENT_DEFAULTS = {
    quickCommerceReturnWindowHours: 24,
    marketplaceReturnWindowHours: 168, // 7 days
    estimatedDeliveryDays: 5,
};

const readFulfilmentSetting = async (key) => {
    try {
        const doc = await Settings.findOne({ key: 'fulfilment' }).lean();
        const value = Number(doc?.value?.[key]);
        return Number.isFinite(value) && value >= 0 ? value : FULFILMENT_DEFAULTS[key];
    } catch {
        return FULFILMENT_DEFAULTS[key];
    }
};

export const getReturnWindowHours = async (experience) =>
    readFulfilmentSetting(
        experience === 'quick_commerce'
            ? 'quickCommerceReturnWindowHours'
            : 'marketplaceReturnWindowHours'
    );

export const getEstimatedDeliveryDays = () => readFulfilmentSetting('estimatedDeliveryDays');

/**
 * Calculate commission for a vendor order item group
 * @param {string} vendorId
 * @param {number} subtotal
 * @returns {{ commission, vendorEarnings, commissionRate }}
 */
export const calculateCommission = async (vendorId, subtotal) => {
    const vendor = await Vendor.findById(vendorId).select('commissionRate');
    if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

    const commissionRate = vendor.commissionRate || 10;
    const commission = parseFloat(((subtotal * commissionRate) / 100).toFixed(2));
    const vendorEarnings = parseFloat((subtotal - commission).toFixed(2));

    return { commissionRate, commission, vendorEarnings };
};

/**
 * Get commission summary for a vendor
 */
export const getVendorCommissionSummary = async (vendorId) => {
    const result = await Commission.aggregate([
        { $match: { vendorId: vendorId } },
        {
            $group: {
                _id: '$status',
                total: { $sum: '$vendorEarnings' },
                count: { $sum: 1 },
            },
        },
    ]);

    return result.reduce((acc, r) => {
        acc[r._id] = { total: r.total, count: r.count };
        return acc;
    }, {});
};

/**
 * Ensure Commission ledger records exist for all vendor items in an order.
 * Idempotent — will NOT create duplicate records if Commission already exists for (orderId, vendorId).
 *
 * @param {object} order Order document or lean object
 * @returns {Promise<Array>} Array of created or existing Commission documents
 */
export const ensureVendorCommissionsForOrder = async (order) => {
    if (!order || !order._id) return [];

    const orderId = order._id;
    const vendorItems = Array.isArray(order.vendorItems) && order.vendorItems.length > 0
        ? order.vendorItems
        : (order.vendorId ? [{
            vendorId: order.vendorId,
            subtotal: order.subtotal || order.total,
            items: order.items || [],
        }] : []);

    if (!vendorItems.length) return [];

    const createdCommissions = [];

    for (const vGroup of vendorItems) {
        const vendorId = vGroup.vendorId || order.vendorId;
        if (!vendorId) continue;

        // Check if commission document already exists for this order & vendor
        const existingComm = await Commission.findOne({ orderId, vendorId });
        if (existingComm) {
            createdCommissions.push(existingComm);
            continue;
        }

        // Fetch vendor details for storeName & commissionRate
        const vendorDoc = await Vendor.findById(vendorId).select('storeName name commissionRate').lean();
        const commissionRate = Number(vGroup.commissionRate ?? vendorDoc?.commissionRate ?? 10);
        const subtotal = Number(vGroup.subtotal || 0);

        const commission = parseFloat(((subtotal * commissionRate) / 100).toFixed(2));
        const vendorEarnings = parseFloat((subtotal - commission).toFixed(2));
        const vendorName = vGroup.vendorName || vendorDoc?.storeName || vendorDoc?.name || 'Vendor';

        const orderType = String(
            vGroup.orderType || order.orderType || order.experience || 'retail'
        ).toLowerCase();

        const newComm = await Commission.create({
            orderId,
            vendorId,
            vendorName,
            subtotal,
            commissionRate,
            commission,
            vendorEarnings,
            orderType,
            status: 'pending',
            savings: 0,
        });

        createdCommissions.push(newComm);
        console.log(`[Commission Service] Created Commission record ${newComm._id} for Order ${order.orderId || orderId} (Vendor ${vendorId}): Net Earning ₹${vendorEarnings}, Fee ₹${commission} (${commissionRate}%)`);
    }

    return createdCommissions;
};

/**
 * Calculate withdrawable balance and fetch eligible commission records for a vendor.
 * Single authoritative calculation shared across earnings and payout controllers.
 *
 * @param {string|ObjectId} vendorId
 * @returns {Promise<{ withdrawableAmount: number, eligibleCommissions: Array, eligibleCommissionIds: Array }>}
 */
export const getVendorWithdrawableCommissions = async (vendorId) => {
    if (!vendorId) return { withdrawableAmount: 0, eligibleCommissions: [], eligibleCommissionIds: [] };

    const pendingCommissions = await Commission.find({ vendorId, status: 'pending' })
        .populate('orderId', 'orderId status deliveredAt createdAt')
        .lean();

    const escrowDays = await getVendorEscrowDays();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - escrowDays);

    let withdrawableAmount = 0;
    const eligibleCommissions = [];
    const eligibleCommissionIds = [];

    for (const c of pendingCommissions) {
        const orderStatus = String(c.orderId?.status || '').toLowerCase();
        const deliveredAt = c.orderId?.deliveredAt;

        if (orderStatus === 'delivered' && deliveredAt && new Date(deliveredAt) <= sevenDaysAgo) {
            const earnings = Number(c.vendorEarnings || 0);
            withdrawableAmount += earnings;
            eligibleCommissions.push(c);
            eligibleCommissionIds.push(c._id);
        }
    }

    return {
        withdrawableAmount: parseFloat(withdrawableAmount.toFixed(2)),
        eligibleCommissions,
        eligibleCommissionIds,
    };
};
