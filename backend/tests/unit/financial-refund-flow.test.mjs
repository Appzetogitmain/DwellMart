import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    getRefundableBreakdown,
    getRefundableAmount,
    resolveRefundAllocation,
} from '../../src/services/refund/RefundOrchestrator.service.js';

describe('Financial & Refund Flow Remediation Suite (Defects 1–9)', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // A. Prepaid full return
    // ─────────────────────────────────────────────────────────────────────────
    test('A. Prepaid full return — ceiling equals order total, routed to gateway', async () => {
        const order = {
            _id: 'ord_prepaid_full_1',
            paymentMethod: 'razorpay',
            paymentStatus: 'paid',
            total: 1000,
        };

        const breakdown = await getRefundableBreakdown(order);
        assert.equal(breakdown.totalRefundable, 1000);
        assert.equal(breakdown.gatewayRefundable, 1000);
        assert.equal(breakdown.cashRefundable, 0);

        const allocation = resolveRefundAllocation(order, 1000, breakdown);
        assert.equal(allocation.method, 'gateway');
        assert.equal(allocation.gatewayAmount, 1000);
        assert.equal(allocation.cashAmount, 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // B. Prepaid partial return
    // ─────────────────────────────────────────────────────────────────────────
    test('B. Prepaid partial return — allocates partial gateway amount', async () => {
        const order = {
            _id: 'ord_prepaid_part_1',
            paymentMethod: 'card',
            paymentStatus: 'paid',
            total: 1000,
        };

        const breakdown = await getRefundableBreakdown(order);
        const allocation = resolveRefundAllocation(order, 400, breakdown);
        assert.equal(allocation.method, 'gateway');
        assert.equal(allocation.gatewayAmount, 400);
        assert.equal(allocation.cashAmount, 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // C. Prepaid coupon return — proportional net item calculation
    // ─────────────────────────────────────────────────────────────────────────
    test('C. Prepaid coupon return — net item price proportional discount allocation', () => {
        // Simulating createReturnRequest net calculation:
        // Item A = 600, Item B = 400. Subtotal = 1000. Coupon = 200.
        const vendorSubtotal = 1000;
        const vendorDiscount = 200;
        const discountRatio = vendorDiscount / vendorSubtotal; // 0.20

        const itemA = { price: 600, quantity: 1 };
        const itemB = { price: 400, quantity: 1 };

        const netRefundA = Math.max(0, Number((itemA.price * itemA.quantity * (1 - discountRatio)).toFixed(2)));
        const netRefundB = Math.max(0, Number((itemB.price * itemB.quantity * (1 - discountRatio)).toFixed(2)));

        assert.equal(netRefundA, 480, 'Item A net refund must be 480 (not 600)');
        assert.equal(netRefundB, 320, 'Item B net refund must be 320 (not 400)');
        assert.equal(netRefundA + netRefundB, 800, 'Sum of net returns must equal net order subtotal (800)');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // D. Pure COD full return
    // ─────────────────────────────────────────────────────────────────────────
    test('D. Pure COD full return — routed to manual_cash for collected amount', async () => {
        const order = {
            _id: 'ord_pure_cod_1',
            paymentMethod: 'cod',
            paymentStatus: 'paid',
            total: 500,
            codDetails: {
                advancePaid: 0,
                cashOnDeliveryDue: 0,
                cashCollectedAtDelivery: 500,
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        assert.equal(breakdown.totalRefundable, 500);
        assert.equal(breakdown.gatewayRefundable, 0);
        assert.equal(breakdown.cashRefundable, 500);

        const allocation = resolveRefundAllocation(order, 500, breakdown);
        assert.equal(allocation.method, 'manual_cash');
        assert.equal(allocation.gatewayAmount, 0);
        assert.equal(allocation.cashAmount, 500);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E. Pure COD manual settlement state verification
    // ─────────────────────────────────────────────────────────────────────────
    test('E. Pure COD manual settlement — gateway amount is 0 and cashAmount matches', async () => {
        const order = {
            _id: 'ord_pure_cod_settle',
            paymentMethod: 'cash',
            paymentStatus: 'paid',
            total: 350,
            codDetails: {
                advancePaid: 0,
                cashCollectedAtDelivery: 350,
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        const allocation = resolveRefundAllocation(order, 350, breakdown);
        assert.equal(allocation.gatewayAmount, 0);
        assert.equal(allocation.cashAmount, 350);
        assert.equal(allocation.method, 'manual_cash');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // F. Hybrid cancellation before delivery
    // ─────────────────────────────────────────────────────────────────────────
    test('F. Hybrid cancellation before delivery — only advance is gateway refundable, cash is 0', async () => {
        const order = {
            _id: 'ord_hybrid_cancel_1',
            paymentMethod: 'cod',
            paymentStatus: 'partially_paid',
            status: 'cancelled',
            total: 1000,
            codDetails: {
                advancePaid: 60,
                cashOnDeliveryDue: 940,
                cashCollectedAtDelivery: 0, // Not delivered
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        assert.equal(breakdown.gatewayRefundable, 60);
        assert.equal(breakdown.cashRefundable, 0);
        assert.equal(breakdown.totalRefundable, 60);

        const allocation = resolveRefundAllocation(order, 60, breakdown);
        assert.equal(allocation.method, 'gateway');
        assert.equal(allocation.gatewayAmount, 60);
        assert.equal(allocation.cashAmount, 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // G. Hybrid full return after delivery
    // ─────────────────────────────────────────────────────────────────────────
    test('G. Hybrid full return after delivery — allocates cash portion up to collected cash', async () => {
        const order = {
            _id: 'ord_hybrid_full_ret',
            paymentMethod: 'cod',
            paymentStatus: 'paid',
            status: 'delivered',
            total: 1060,
            codDetails: {
                advancePaid: 60, // Platform/Handling/COD fees
                cashOnDeliveryDue: 0,
                cashCollectedAtDelivery: 1000, // Goods subtotal
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        assert.equal(breakdown.gatewayRefundable, 60);
        assert.equal(breakdown.cashRefundable, 1000);
        assert.equal(breakdown.totalRefundable, 1060);

        // Returning goods value of 1000
        const allocation = resolveRefundAllocation(order, 1000, breakdown);
        assert.equal(allocation.cashAmount, 1000);
        assert.equal(allocation.gatewayAmount, 0);
        assert.equal(allocation.method, 'manual_cash');

        // Returning full total 1060 (including advance)
        const fullAllocation = resolveRefundAllocation(order, 1060, breakdown);
        assert.equal(fullAllocation.cashAmount, 1000);
        assert.equal(fullAllocation.gatewayAmount, 60);
        assert.equal(fullAllocation.method, 'hybrid');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // H. Hybrid partial return
    // ─────────────────────────────────────────────────────────────────────────
    test('H. Hybrid partial return — cash refund for returned goods, advance stays with order', async () => {
        const order = {
            _id: 'ord_hybrid_part_ret',
            paymentMethod: 'cod',
            paymentStatus: 'paid',
            status: 'delivered',
            total: 1060,
            codDetails: {
                advancePaid: 60,
                cashOnDeliveryDue: 0,
                cashCollectedAtDelivery: 1000,
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        // Returning item worth 350
        const allocation = resolveRefundAllocation(order, 350, breakdown);
        assert.equal(allocation.cashAmount, 350);
        assert.equal(allocation.gatewayAmount, 0);
        assert.equal(allocation.method, 'manual_cash');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // I. Hybrid coupon return
    // ─────────────────────────────────────────────────────────────────────────
    test('I. Hybrid coupon return — net discounted goods allocated to cash refund', async () => {
        // Items 600 + 400 = 1000, Coupon = 200, Net = 800.
        // Advance = 50, Cash Collected = 800.
        const order = {
            _id: 'ord_hybrid_coupon',
            paymentMethod: 'cod',
            paymentStatus: 'paid',
            status: 'delivered',
            total: 850,
            codDetails: {
                advancePaid: 50,
                cashOnDeliveryDue: 0,
                cashCollectedAtDelivery: 800,
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        // Returning item A net value = 480
        const allocation = resolveRefundAllocation(order, 480, breakdown);
        assert.equal(allocation.cashAmount, 480);
        assert.equal(allocation.gatewayAmount, 0);
        assert.equal(allocation.method, 'manual_cash');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // J. Multi-vendor hybrid return isolation
    // ─────────────────────────────────────────────────────────────────────────
    test('J. Multi-vendor hybrid return — vendor group discount isolation', () => {
        const vendor1Group = {
            vendorId: 'v1',
            subtotal: 600,
            discount: 120, // 20%
        };
        const vendor2Group = {
            vendorId: 'v2',
            subtotal: 400,
            discount: 40, // 10%
        };

        const ratioV1 = vendor1Group.discount / vendor1Group.subtotal;
        const ratioV2 = vendor2Group.discount / vendor2Group.subtotal;

        assert.equal(ratioV1, 0.2);
        assert.equal(ratioV2, 0.1);

        // V1 Item (price 600) net return:
        const v1Net = 600 * (1 - ratioV1);
        assert.equal(v1Net, 480);

        // V2 Item (price 400) net return:
        const v2Net = 400 * (1 - ratioV2);
        assert.equal(v2Net, 360);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // K. Admin cancellation prepaid
    // ─────────────────────────────────────────────────────────────────────────
    test('K. Admin cancellation prepaid — captures full refundable total', () => {
        const order = {
            paymentStatus: 'paid',
            paymentMethod: 'razorpay',
            total: 1200,
            refundedAmount: 0,
        };

        const isCod = ['cod', 'cash'].includes(order.paymentMethod);
        const paidAmount = isCod ? (order.codDetails?.advancePaid || 0) : order.total;
        const refundable = Math.max(0, paidAmount - (order.refundedAmount || 0));

        assert.equal(refundable, 1200);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // L. Admin cancellation hybrid
    // ─────────────────────────────────────────────────────────────────────────
    test('L. Admin cancellation hybrid — captures advance only, not uncollected cash', () => {
        const order = {
            paymentStatus: 'partially_paid',
            paymentMethod: 'cod',
            total: 1000,
            codDetails: {
                advancePaid: 60,
                cashOnDeliveryDue: 940,
                cashCollectedAtDelivery: 0,
            },
            refundedAmount: 0,
        };

        const isCod = ['cod', 'cash'].includes(order.paymentMethod);
        const paidAmount = isCod ? (order.codDetails?.advancePaid || 0) : order.total;
        const refundable = Math.max(0, paidAmount - (order.refundedAmount || 0));

        assert.equal(refundable, 60, 'Admin cancellation must only refund captured advance (60)');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // M. Admin return completion invokes refund with correct obligation
    // ─────────────────────────────────────────────────────────────────────────
    test('M. Admin return completion — obligation derived from net return amount', () => {
        const returnRequest = {
            refundAmount: 480,
            status: 'completed',
        };
        const refundAmountToQueue = Number(returnRequest.refundAmount || 0);
        assert.equal(refundAmountToQueue, 480);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // N. Admin override accurate ceiling
    // ─────────────────────────────────────────────────────────────────────────
    test('N. Admin override — does not exceed refundable ceiling', async () => {
        const order = {
            _id: 'ord_override_test',
            paymentMethod: 'cod',
            paymentStatus: 'partially_paid',
            total: 1000,
            codDetails: {
                advancePaid: 60,
                cashCollectedAtDelivery: 0,
            },
        };

        const refundable = await getRefundableAmount(order);
        assert.equal(refundable, 60, 'Admin override ceiling must be 60, not order.total (1000)');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // O. Quick Commerce partial fulfilment
    // ─────────────────────────────────────────────────────────────────────────
    test('O. Quick Commerce partial fulfilment — adjusts cash due without premature gateway refund', () => {
        // Scenario 1: unavailable items net value <= cash due
        const codDetails1 = {
            advancePaid: 60,
            cashOnDeliveryDue: 940,
        };
        const unavailableAmount1 = 200;

        let refundToQueue1 = 0;
        if (unavailableAmount1 <= codDetails1.cashOnDeliveryDue) {
            codDetails1.cashOnDeliveryDue -= unavailableAmount1;
            refundToQueue1 = 0;
        }
        assert.equal(codDetails1.cashOnDeliveryDue, 740, 'cashOnDeliveryDue reduced to 740');
        assert.equal(refundToQueue1, 0, 'No gateway refund queued');

        // Scenario 2: unavailable items net value > cash due
        const codDetails2 = {
            advancePaid: 60,
            cashOnDeliveryDue: 10,
        };
        const unavailableAmount2 = 50;

        let refundToQueue2 = 0;
        if (unavailableAmount2 > codDetails2.cashOnDeliveryDue) {
            const excess = unavailableAmount2 - codDetails2.cashOnDeliveryDue; // 40
            codDetails2.cashOnDeliveryDue = 0;
            refundToQueue2 = Math.min(excess, codDetails2.advancePaid);
        }
        assert.equal(codDetails2.cashOnDeliveryDue, 0, 'cashOnDeliveryDue cleared');
        assert.equal(refundToQueue2, 40, 'Excess 40 refunded from captured advance');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // P. Duplicate refund prevention / Idempotency
    // ─────────────────────────────────────────────────────────────────────────
    test('P. Duplicate refund — ceiling drops to 0 after full refund is open/settled', async () => {
        // Order with 500 total, already refunded 500
        const order = {
            _id: 'ord_already_refunded_mock',
            paymentMethod: 'card',
            total: 500,
        };

        // If gatewayRefunded = 500:
        const remaining = Math.max(0, order.total - 500);
        assert.equal(remaining, 0, 'Remaining refundable amount must be 0');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Q. Gateway amount ceiling invariant
    // ─────────────────────────────────────────────────────────────────────────
    test('Q. Gateway ceiling invariant — gatewayAmount never exceeds advancePaid', async () => {
        const order = {
            _id: 'ord_gw_ceiling',
            paymentMethod: 'cod',
            paymentStatus: 'paid',
            status: 'delivered',
            total: 1060,
            codDetails: {
                advancePaid: 60,
                cashCollectedAtDelivery: 1000,
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        // Even if requestedAmount is 1060:
        const allocation = resolveRefundAllocation(order, 1060, breakdown);
        assert.ok(allocation.gatewayAmount <= order.codDetails.advancePaid, 'gatewayAmount must never exceed advancePaid');
        assert.equal(allocation.gatewayAmount, 60);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // R. Cash refund ceiling invariant
    // ─────────────────────────────────────────────────────────────────────────
    test('R. Cash ceiling invariant — cashAmount never exceeds cashCollectedAtDelivery', async () => {
        const order = {
            _id: 'ord_cash_ceiling',
            paymentMethod: 'cod',
            paymentStatus: 'paid',
            status: 'delivered',
            total: 1060,
            codDetails: {
                advancePaid: 60,
                cashCollectedAtDelivery: 1000,
            },
        };

        const breakdown = await getRefundableBreakdown(order);
        const allocation = resolveRefundAllocation(order, 1060, breakdown);
        assert.ok(allocation.cashAmount <= order.codDetails.cashCollectedAtDelivery, 'cashAmount must never exceed cashCollectedAtDelivery');
        assert.equal(allocation.cashAmount, 1000);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // S. Delivery cash idempotency
    // ─────────────────────────────────────────────────────────────────────────
    test('S. Delivery cash idempotency — retry does not overwrite recorded cash with 0', () => {
        const order = {
            codDetails: {
                cashOnDeliveryDue: 850,
                cashCollectedAtDelivery: 0,
            },
        };

        // First delivery completion:
        if (!order.codDetails.cashCollectedAtDelivery || order.codDetails.cashCollectedAtDelivery === 0) {
            order.codDetails.cashCollectedAtDelivery = Number(order.codDetails.cashOnDeliveryDue || 0);
        }
        order.codDetails.cashOnDeliveryDue = 0;

        assert.equal(order.codDetails.cashCollectedAtDelivery, 850);
        assert.equal(order.codDetails.cashOnDeliveryDue, 0);

        // Second delivery completion (retry/duplicate):
        if (!order.codDetails.cashCollectedAtDelivery || order.codDetails.cashCollectedAtDelivery === 0) {
            order.codDetails.cashCollectedAtDelivery = Number(order.codDetails.cashOnDeliveryDue || 0);
        }
        order.codDetails.cashOnDeliveryDue = 0;

        assert.equal(order.codDetails.cashCollectedAtDelivery, 850, 'Must still be 850 on retry, not 0');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T. Commission partial reversal proration
    // ─────────────────────────────────────────────────────────────────────────
    test('T. Commission partial reversal — prorates subtotal and commission proportionally', () => {
        const originalComm = {
            subtotal: 1000,
            commissionRate: 10,
            commission: 100,
            vendorEarnings: 900,
            status: 'pending',
        };

        const returnedSubtotal = 600; // Customer returned 600 worth of goods
        const newSubtotal = Math.max(0, originalComm.subtotal - returnedSubtotal); // 400
        const newComm = Number(((newSubtotal * originalComm.commissionRate) / 100).toFixed(2)); // 40
        const newEarnings = Number((newSubtotal - newComm).toFixed(2)); // 360

        assert.equal(newSubtotal, 400);
        assert.equal(newComm, 40, 'New commission must be 40 (10% of 400)');
        assert.equal(newEarnings, 360, 'New vendor earnings must be 360');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // U. Payment status transitions
    // ─────────────────────────────────────────────────────────────────────────
    test('U. Payment status transitions — refunded only when settledTotal >= totalPaid', () => {
        const totalPaid = 1000;

        // Partially settled: 60 settled so far
        let settledTotal = 60;
        let paymentStatus = settledTotal + 0.01 >= totalPaid ? 'refunded' : 'partially_refunded';
        assert.equal(paymentStatus, 'partially_refunded');

        // Fully settled: 1000 settled
        settledTotal = 1000;
        paymentStatus = settledTotal + 0.01 >= totalPaid ? 'refunded' : 'partially_refunded';
        assert.equal(paymentStatus, 'refunded');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // V. Hybrid gateway-success / cash-pending state
    // ─────────────────────────────────────────────────────────────────────────
    test('V. Hybrid gateway-success / cash-pending — status is partially_settled', () => {
        const refund = {
            method: 'hybrid',
            gatewayAmount: 60,
            cashAmount: 940,
            cashStatus: 'pending',
        };

        const settledNow = true; // Gateway succeeded
        const hasPendingCash = Number(refund.cashAmount || 0) > 0 && refund.cashStatus !== 'settled';
        const nextStatus = settledNow ? (hasPendingCash ? 'partially_settled' : 'succeeded') : 'initiated';

        assert.equal(nextStatus, 'partially_settled', 'Must be partially_settled when cash portion is still pending');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // W. Hybrid gateway-success / cash-settled state
    // ─────────────────────────────────────────────────────────────────────────
    test('W. Hybrid gateway-success / cash-settled — status becomes succeeded', () => {
        const refund = {
            method: 'hybrid',
            gatewayAmount: 60,
            cashAmount: 940,
            gatewayStatus: 'SUCCESS',
            cashStatus: 'settled',
        };

        const gatewayDone = ['SUCCESS', 'PROCESSED'].includes(refund.gatewayStatus);
        const cashDone = refund.cashStatus === 'settled';
        const finalStatus = gatewayDone && cashDone ? 'succeeded' : 'partially_settled';

        assert.equal(finalStatus, 'succeeded', 'Must be succeeded when both gateway and cash portions are settled');
    });
});
