import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';

const toPositiveNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);

const getCustomerIdFromOrder = (order) => {
    const userId = order?.userId?._id || order?.userId;
    if (userId) return String(userId);

    const email = normalizeEmail(order?.shippingAddress?.email || order?.guestInfo?.email);
    if (email) return `guest-email:${email}`;

    const phone = normalizePhone(order?.shippingAddress?.phone || order?.guestInfo?.phone);
    if (phone) return `guest-phone:${phone}`;

    return `guest-order:${String(order?.orderId ?? order?._id)}`;
};

const getCustomerIdentity = (order) => ({
    name:
        order?.shippingAddress?.name ||
        order?.guestInfo?.name ||
        'Guest Customer',
    email:
        order?.shippingAddress?.email ||
        order?.guestInfo?.email ||
        '',
    phone:
        order?.shippingAddress?.phone ||
        order?.guestInfo?.phone ||
        '',
});

const getVendorItemTotal = (order, vendorId) => {
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    if (!vendorItem) return 0;
    const subtotal = toPositiveNumber(vendorItem?.subtotal);
    const shipping = toPositiveNumber(vendorItem?.shipping);
    const tax = toPositiveNumber(vendorItem?.tax);
    const discount = toPositiveNumber(vendorItem?.discount);
    return Math.max(0, subtotal + shipping + tax - discount);
};

const getVendorItemStatus = (order, vendorId) => {
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    return String(vendorItem?.status || '').toLowerCase();
};

const shouldIncludeOrderForMetrics = (order, vendorId) => {
    if (order?.isDeleted) return false;
    const orderStatus = String(order?.status || '').toLowerCase();
    if (orderStatus === 'cancelled' || orderStatus === 'returned') return false;

    const vendorItemStatus = getVendorItemStatus(order, vendorId);
    if (vendorItemStatus === 'cancelled') return false;

    return true;
};

export const getVendorCustomers = asyncHandler(async (req, res) => {
    const { search = '', page = 1, limit = 10 } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (numericPage - 1) * numericLimit;

    const orders = await Order.find({
        'vendorItems.vendorId': req.user.id,
        $or: [{ fulfillmentType: req.vendorWorkspace }, { orderType: req.vendorWorkspace }, { 'vendorItems.orderType': req.vendorWorkspace }],
    })
        .sort({ createdAt: -1 })
        .select('userId guestInfo shippingAddress vendorItems status fulfillmentType orderType createdAt date orderId isDeleted')
        .lean();

    const customerMap = {};
    for (const order of orders) {
        if (!shouldIncludeOrderForMetrics(order, req.user.id)) continue;

        const customerId = getCustomerIdFromOrder(order);
        const identity = getCustomerIdentity(order);
        const orderDate = order?.createdAt ?? order?.date ?? null;
        const orderTotal = getVendorItemTotal(order, req.user.id);

        if (!customerMap[customerId]) {
            customerMap[customerId] = {
                id: customerId,
                name: identity.name,
                email: identity.email,
                phone: identity.phone,
                orders: 0,
                totalSpent: 0,
                lastOrderDate: orderDate,
            };
        }

        customerMap[customerId].orders += 1;
        customerMap[customerId].totalSpent += orderTotal;

        if (orderDate) {
            const existingDate = customerMap[customerId].lastOrderDate
                ? new Date(customerMap[customerId].lastOrderDate)
                : null;
            const currentDate = new Date(orderDate);
            if (!existingDate || currentDate > existingDate) {
                customerMap[customerId].lastOrderDate = orderDate;
            }
        }
    }

    const query = String(search).trim().toLowerCase();
    let customers = Object.values(customerMap).map((customer) => ({
        ...customer,
        totalSpent: Number(customer.totalSpent.toFixed(2)),
    }));

    if (query) {
        customers = customers.filter((customer) =>
            (customer.name || '').toLowerCase().includes(query) ||
            (customer.email || '').toLowerCase().includes(query) ||
            (customer.phone || '').toLowerCase().includes(query)
        );
    }

    customers.sort((a, b) => {
        const aDate = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0;
        const bDate = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0;
        return bDate - aDate;
    });

    const total = customers.length;
    const totalRevenue = customers.reduce((sum, customer) => sum + toPositiveNumber(customer.totalSpent), 0);
    const averageCustomerValue = total > 0 ? totalRevenue / total : 0;
    const paginated = customers.slice(skip, skip + numericLimit);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                customers: paginated,
                summary: {
                    totalCustomers: total,
                    totalRevenue: Number(totalRevenue.toFixed(2)),
                    averageCustomerValue: Number(averageCustomerValue.toFixed(2)),
                },
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.max(Math.ceil(total / numericLimit), 1),
                },
            },
            'Customers fetched.'
        )
    );
});

export const getVendorCustomerById = asyncHandler(async (req, res) => {
    const customerId = String(req.params.id);
    const { page = 1, limit = 10 } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (numericPage - 1) * numericLimit;

    const orders = await Order.find({
        'vendorItems.vendorId': req.user.id,
        $or: [{ fulfillmentType: req.vendorWorkspace }, { orderType: req.vendorWorkspace }, { 'vendorItems.orderType': req.vendorWorkspace }],
    })
        .sort({ createdAt: -1 })
        .select('userId guestInfo shippingAddress vendorItems status createdAt date orderId isDeleted')
        .lean();

    const customerOrders = orders
        .filter((order) => getCustomerIdFromOrder(order) === customerId)
        .filter((order) => shouldIncludeOrderForMetrics(order, req.user.id));

    if (customerOrders.length === 0) {
        throw new ApiError(404, 'Customer not found.');
    }

    const firstOrder = customerOrders[0];
    const identity = getCustomerIdentity(firstOrder);
    const totalSpent = customerOrders.reduce(
        (sum, order) => sum + getVendorItemTotal(order, req.user.id),
        0
    );

    const paginatedHistory = customerOrders.slice(skip, skip + numericLimit);

    const detail = {
        id: customerId,
        name: identity.name,
        email: identity.email,
        phone: identity.phone,
        orders: customerOrders.length,
        totalSpent: Number(totalSpent.toFixed(2)),
        lastOrderDate: firstOrder?.createdAt ?? firstOrder?.date ?? null,
        orderHistory: paginatedHistory,
        pagination: {
            total: customerOrders.length,
            page: numericPage,
            limit: numericLimit,
            pages: Math.max(Math.ceil(customerOrders.length / numericLimit), 1),
        },
    };

    res.status(200).json(new ApiResponse(200, detail, 'Customer details fetched.'));
});
