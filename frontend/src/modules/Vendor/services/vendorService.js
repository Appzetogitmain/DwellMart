import api from '../../../shared/utils/api';

// ─── AUTH ──────────────────────────────────────────────────────────────────────

/**
 * Register a new vendor (pending approval + OTP email sent)
 * @param {FormData} formData - Contains name, email, password, phone, storeName, storeDescription, address, selectedPlanId, agreedToTerms, tradeLicense
 */
export const registerVendor = (formData) =>
  api.post('/vendor/auth/register', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const selectVendorSubscriptionPlan = (planId, country = '') =>
  api.post('/subscription/select-plan', { planId, country });

export const initiateVendorOnboardingSubscription = (email, payload = {}) =>
  api.post('/subscription/initiate', { email, ...payload });

/**
 * Get active subscription plans for public display (e.g. during signup)
 */
export const getPublicSubscriptionPlans = (country = '') =>
  api.get('/subscription-plans', { params: country ? { country } : {} });


export const getVendorOnboardingStatus = (email) =>
    api.post('/vendor/auth/onboarding-status', { email });

export const getVendorSubscription = () => api.get('/vendor/subscription');

export const getVendorSubscriptionPlans = () => api.get('/vendor/subscription/plans');

export const changeVendorSubscriptionPlan = (planId) =>
  api.post('/vendor/subscription/change-plan', { planId });


/**
 * Request reset OTP for vendor forgot password flow
 * @param {string} email
 */
export const forgotVendorPassword = (email) =>
    api.post('/vendor/auth/forgot-password', { email });

/**
 * Verify reset OTP
 * @param {string} email
 * @param {string} otp
 */
export const verifyVendorResetOTP = (email, otp) =>
    api.post('/vendor/auth/verify-reset-otp', { email, otp });

/**
 * Reset vendor password after reset OTP verification
 * @param {string} email
 * @param {string} password
 * @param {string} confirmPassword
 */
export const resetVendorPassword = (email, password, confirmPassword) =>
    api.post('/vendor/auth/reset-password', { email, password, confirmPassword });

/**
 * Login vendor — returns { accessToken, refreshToken, vendor }
 * @param {string} email
 * @param {string} password
 */
export const loginVendor = (email, password) =>
    api.post('/vendor/auth/login', { email, password });

/**
 * Get current vendor profile
 */
export const getVendorProfile = () => api.get('/vendor/auth/profile');

/**
 * Update vendor profile (name, phone, storeName, storeDescription, address)
 * @param {{ name?, phone?, storeName?, storeDescription?, address? }} data
 */
export const updateVendorProfile = (data) => api.put('/vendor/auth/profile', data);

/**
 * Update vendor selling channels (Retail / Wholesale) and, when enabling
 * Wholesale, the associated wholesale business profile.
 * @param {{ sellingChannels: { retail: { enabled: boolean }, wholesale: { enabled: boolean } }, wholesaleProfile?: object }} data
 */
export const updateVendorSellingChannels = (data) => api.put('/vendor/auth/selling-channels', data);

/**
 * Update the vendor's Quick Commerce operating profile — store type, location,
 * radius, prep time, business hours, and availability.
 * Coordinates are sent as latitude/longitude; the server stores GeoJSON.
 */
export const updateVendorQuickCommerceSettings = (data) =>
    api.put('/vendor/quick-commerce/settings', data);

/**
 * Update vendor password
 * @param {string} currentPassword 
 * @param {string} newPassword 
 */
export const changeVendorPassword = (currentPassword, newPassword) =>
    api.put('/vendor/auth/change-password', { currentPassword, newPassword });


// ─── PRODUCTS ──────────────────────────────────────────────────────────────────

/**
 * Get paginated products for the authenticated vendor
 * @param {{ page?, limit?, search?, stock? }} params
 */
export const getVendorProducts = (params = {}) =>
    api.get('/vendor/products', { params });

export const getVendorTaxPricingRules = () =>
    api.get('/vendor/products/tax-pricing-rules');

/**
 * Get single product details for the authenticated vendor
 * @param {string} id - MongoDB _id
 */
export const getVendorProductById = (id) =>
    api.get(`/vendor/products/${id}`);

/**
 * Create a new product
 * @param {object} data
 */
export const createVendorProduct = (data) => api.post('/vendor/products', data);

/**
 * Update an existing product
 * @param {string} id  — MongoDB _id
 * @param {object} data
 */
export const updateVendorProduct = (id, data) =>
    api.put(`/vendor/products/${id}`, data);

/**
 * Delete a product
 * @param {string} id  — MongoDB _id
 */
export const deleteVendorProduct = (id) =>
    api.delete(`/vendor/products/${id}`);

/**
 * Update stock quantity for a product (auto-updates stock status)
 * @param {string} productId  — MongoDB _id
 * @param {number} stockQuantity
 */
export const updateVendorStock = (productId, stockQuantity) =>
    api.patch(`/vendor/stock/${productId}`, { stockQuantity });

// Bulk Product Upload & Export (Vendor)
export const validateVendorBulkProductUpload = (formData) =>
    api.post('/vendor/products/bulk-upload/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

export const processVendorBulkProductUpload = (payload) =>
    api.post('/vendor/products/bulk-upload/process', payload);

export const getVendorBulkProductJobProgress = (jobId) =>
    api.get(`/vendor/products/bulk-upload/job/${jobId}`);

export const cancelVendorBulkProductJob = (jobId) =>
    api.post(`/vendor/products/bulk-upload/job/${jobId}/cancel`);

export const getVendorBulkProductImportHistory = (params = {}) =>
    api.get('/vendor/products/bulk-upload/history', { params });

export const downloadVendorProductTemplate = async (format = 'excel', workspace = null) => {
    const params = workspace ? { workspace } : {};
    const response = await api.get(`/vendor/products/template/${format}`, { params, responseType: 'blob' });
    const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([response], { type: mimeType });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    const prefix = workspace === 'quick_commerce'
        ? 'Quick_Commerce'
        : workspace === 'wholesale'
            ? 'Wholesale'
            : 'Vendor';
    link.setAttribute('download', `DwellMart_${prefix}_Product_Template.${format === 'csv' ? 'csv' : 'xlsx'}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
};

export const exportVendorProductsCatalog = async (format = 'xlsx') => {
    const response = await api.get('/vendor/products/export', {
        params: { format },
        responseType: 'blob',
    });
    const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([response], { type: mimeType });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `DwellMart_Vendor_Products_Export.${format === 'csv' ? 'csv' : 'xlsx'}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
};


// ─── ORDERS ────────────────────────────────────────────────────────────────────

/**
 * Get paginated orders containing this vendor's items
 * @param {{ page?, limit?, status? }} params
 */
export const getVendorOrders = (params = {}) =>
    api.get('/vendor/orders', { params });

/**
 * Get all vendor orders by paging through the vendor orders endpoint.
 * Keeps UI accurate for large datasets.
 * @param {{ limit?: number, status?: string }} params
 */
export const getAllVendorOrders = async (params = {}) => {
    const pageSize = Math.max(Number.parseInt(params.limit, 10) || 100, 1);
    let page = 1;
    let pages = 1;
    let total = 0;
    const allOrders = [];

    do {
        const res = await getVendorOrders({ ...params, page, limit: pageSize });
        const payload = res?.data ?? res;
        const orders = Array.isArray(payload?.orders) ? payload.orders : [];
        allOrders.push(...orders);
        total = Number(payload?.total || allOrders.length);
        pages = Math.max(Number(payload?.pages || 1), 1);
        page += 1;
    } while (page <= pages);

    return {
        orders: allOrders,
        total,
        page: 1,
        pages,
    };
};

/**
 * Get a single order (by orderId or _id) for the authenticated vendor
 * @param {string} id
 */
export const getVendorOrderById = (id) =>
    api.get(`/vendor/orders/${id}`);

/**
 * Update the status of this vendor's items in an order
 * @param {string} orderId  — the order's _id or orderId
 * @param {'pending'|'processing'|'shipped'|'delivered'|'cancelled'} status
 */
export const updateVendorOrderStatus = (orderId, status) =>
    api.patch(`/vendor/orders/${orderId}/status`, { status });

export const updateVendorQuickCommerceStatus = (orderId, status) =>
    api.patch(`/vendor/orders/${orderId}/quick-status`, { status });

/**
 * Get customers for the authenticated vendor
 * @param {{ search?: string }} params
 */
export const getVendorCustomers = (params = {}) =>
    api.get('/vendor/customers', { params });

/**
 * Get one customer detail for the authenticated vendor
 * @param {string} id
 * @param {{ page?: number, limit?: number }} params
 */
export const getVendorCustomerById = (id, params = {}) =>
    api.get(`/vendor/customers/${id}`, { params });

/**
 * Get vendor chat threads
 */
export const getVendorChatThreads = () =>
    api.get('/vendor/chat/threads');

/**
 * Get vendor chat messages by thread id
 * @param {string} id
 */
export const getVendorChatMessages = (id) =>
    api.get(`/vendor/chat/threads/${id}/messages`);

/**
 * Send vendor chat message
 * @param {string} id
 * @param {string} message
 */
export const sendVendorChatMessage = (id, message) =>
    api.post(`/vendor/chat/threads/${id}/messages`, { message });

/**
 * Mark vendor chat as read
 * @param {string} id
 */
export const markVendorChatRead = (id) =>
    api.patch(`/vendor/chat/threads/${id}/read`);

/**
 * Update vendor chat status
 * @param {string} id
 * @param {'active'|'resolved'} status
 */
export const updateVendorChatStatus = (id, status) =>
    api.patch(`/vendor/chat/threads/${id}/status`, { status });

/**
 * Get vendor documents
 */
export const getVendorDocuments = () =>
    api.get('/vendor/documents');

/**
 * Upload vendor document
 * @param {{ name: string, category: string, expiryDate?: string }} data
 * @param {File} file
 */
export const uploadVendorDocument = (data, file) => {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('category', data.category);
    if (data.expiryDate) formData.append('expiryDate', data.expiryDate);
    formData.append('file', file);
    return api.post('/vendor/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

/**
 * Delete vendor document
 * @param {string} id
 */
export const deleteVendorDocument = (id) =>
    api.delete(`/vendor/documents/${id}`);

/**
 * Get vendor notifications
 * @param {{ page?: number, limit?: number, type?: string, isRead?: string }} params
 */
export const getVendorNotifications = (params = {}) =>
    api.get('/vendor/notifications', { params });

/**
 * Mark a vendor notification as read
 * @param {string} id
 */
export const markVendorNotificationAsRead = (id) =>
    api.put(`/vendor/notifications/${id}/read`);

/**
 * Mark all vendor notifications as read
 */
export const markAllVendorNotificationsAsRead = () =>
    api.put('/vendor/notifications/read-all');

/**
 * Delete vendor notification
 * @param {string} id
 */
export const deleteVendorNotification = (id) =>
    api.delete(`/vendor/notifications/${id}`);

/**
 * Get inventory report for the authenticated vendor
 * @param {{ lowStockOnly?: boolean }} params
 */
export const getVendorInventoryReport = (params = {}) =>
    api.get('/vendor/inventory/reports', { params });

/**
 * Get performance metrics for the authenticated vendor
 */
export const getVendorPerformanceMetrics = () =>
    api.get('/vendor/performance/metrics');

/**
 * Get analytics overview for the authenticated vendor
 * @param {{ period?: 'today'|'week'|'month'|'year' }} params
 */
export const getVendorAnalyticsOverview = (params = {}) =>
    api.get('/vendor/analytics/overview', { params });

/**
 * Get paginated return requests for the authenticated vendor
 * @param {{ page?, limit?, search?, status? }} params
 */
export const getVendorReturnRequests = (params = {}) =>
    api.get('/vendor/return-requests', { params });

/**
 * Get all vendor return requests by paging through the vendor return endpoint.
 * @param {{ limit?: number, search?: string, status?: string }} params
 */
export const getAllVendorReturnRequests = async (params = {}) => {
    const pageSize = Math.max(Number.parseInt(params.limit, 10) || 100, 1);
    let page = 1;
    let pages = 1;
    let total = 0;
    const allRequests = [];

    do {
        const res = await getVendorReturnRequests({ ...params, page, limit: pageSize });
        const payload = res?.data ?? res;
        const pageRequests = Array.isArray(payload?.returnRequests) ? payload.returnRequests : [];
        allRequests.push(...pageRequests);

        const pagination = payload?.pagination || {};
        total = Number(pagination?.total || allRequests.length);
        pages = Math.max(Number(pagination?.pages || 1), 1);
        page += 1;
    } while (page <= pages);

    return {
        returnRequests: allRequests,
        pagination: {
            total,
            page: 1,
            limit: pageSize,
            pages,
        },
    };
};

/**
 * Get a single return request for the authenticated vendor
 * @param {string} id
 */
export const getVendorReturnRequestById = (id) =>
    api.get(`/vendor/return-requests/${id}`);

/**
 * Update return request status for the authenticated vendor
 * @param {string} id
 * @param {{ status?: 'pending'|'approved'|'processing'|'rejected'|'completed', refundStatus?: 'pending'|'processed'|'failed', rejectionReason?: string }} payload
 */
export const updateVendorReturnRequestStatus = (id, payload) =>
    api.patch(`/vendor/return-requests/${id}/status`, payload);

/**
 * Get paginated product reviews for the authenticated vendor
 * @param {{ page?, limit?, rating?, productId? }} params
 */
export const getVendorReviews = (params = {}) =>
    api.get('/vendor/reviews', { params });

/**
 * Get all vendor reviews by paging through the vendor reviews endpoint.
 * @param {{ limit?: number, rating?: number|string, productId?: string }} params
 */
export const getAllVendorReviews = async (params = {}) => {
    const pageSize = Math.max(Number.parseInt(params.limit, 10) || 100, 1);
    let page = 1;
    let pages = 1;
    let total = 0;
    const allReviews = [];

    do {
        const res = await getVendorReviews({ ...params, page, limit: pageSize });
        const payload = res?.data ?? res;
        const pageReviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
        allReviews.push(...pageReviews);

        const pagination = payload?.pagination || {};
        total = Number(pagination?.total || allReviews.length);
        pages = Math.max(Number(pagination?.pages || 1), 1);
        page += 1;
    } while (page <= pages);

    return {
        reviews: allReviews,
        pagination: {
            total,
            page: 1,
            limit: pageSize,
            pages,
        },
    };
};

/**
 * Update vendor review moderation status
 * @param {string} id
 * @param {'approved'|'pending'|'hidden'} status
 */
export const updateVendorReviewStatus = (id, status) =>
    api.patch(`/vendor/reviews/${id}/status`, { status });

/**
 * Add vendor response to a review
 * @param {string} id
 * @param {string} response
 */
export const addVendorReviewResponse = (id, response) =>
    api.patch(`/vendor/reviews/${id}/response`, { response });


/**
 * Get all shipping zones for authenticated vendor
 */
export const getVendorShippingZones = () =>
    api.get('/vendor/shipping/zones');

/**
 * Create shipping zone
 * @param {{ name: string, countries: string[] }} payload
 */
export const createVendorShippingZone = (payload) =>
    api.post('/vendor/shipping/zones', payload);

/**
 * Update shipping zone
 * @param {string} id
 * @param {{ name?: string, countries?: string[] }} payload
 */
export const updateVendorShippingZone = (id, payload) =>
    api.put(`/vendor/shipping/zones/${id}`, payload);

/**
 * Delete shipping zone
 * @param {string} id
 */
export const deleteVendorShippingZone = (id) =>
    api.delete(`/vendor/shipping/zones/${id}`);

/**
 * Get all shipping rates for authenticated vendor
 */
export const getVendorShippingRates = () =>
    api.get('/vendor/shipping/rates');

/**
 * Create shipping rate
 * @param {{ zoneId: string, name: string, rate: number, freeShippingThreshold?: number }} payload
 */
export const createVendorShippingRate = (payload) =>
    api.post('/vendor/shipping/rates', payload);

/**
 * Update shipping rate
 * @param {string} id
 * @param {{ zoneId?: string, name?: string, rate?: number, freeShippingThreshold?: number }} payload
 */
export const updateVendorShippingRate = (id, payload) =>
    api.put(`/vendor/shipping/rates/${id}`, payload);

/**
 * Delete shipping rate
 * @param {string} id
 */
export const deleteVendorShippingRate = (id) =>
    api.delete(`/vendor/shipping/rates/${id}`);


// ─── EARNINGS ──────────────────────────────────────────────────────────────────

/**
 * Get earnings summary + commission history
 * Returns { summary: { totalEarnings, pendingEarnings, paidEarnings, totalCommission, totalOrders }, commissions: [...] }
 */
export const getVendorEarnings = () => api.get('/vendor/earnings');
export const requestVendorPayout = (data) => api.post('/vendor/earnings/request-payout', data);


// ─── BANK DETAILS ───────────────────────────────────────────────────────────────

/**
 * Update vendor bank/payment details (stored server-side, select:false)
 * @param {{ accountName?, accountNumber?, bankName?, ifscCode? }} data
 */
export const updateVendorBankDetails = (data) =>
    api.put('/vendor/auth/bank-details', data);

/**
 * Upload a single vendor image using multer + Cloudinary pipeline
 * @param {File} file
 * @param {string} folder
 * @param {string} [publicId]
 */
export const uploadVendorImage = (file, folder = 'vendors/products', publicId) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folder', folder);
    if (publicId) {
        formData.append('publicId', publicId);
    }
    return api.post('/vendor/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

/**
 * Upload multiple vendor images using multer + Cloudinary pipeline
 * @param {File[]} files
 * @param {string} folder
 */
export const uploadVendorImages = (files, folder = 'vendors/products') => {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    formData.append('folder', folder);
    return api.post('/vendor/uploads/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

// ─── DTDC Shipments ───────────────────────────────────────────────────────────
/**
 * @param {object} [packageDetails] vendor-confirmed weight/dimensions. Applies
 *        to this shipment only; the product is never modified.
 */
export const bookDtdcShipment = (orderId, packageDetails = undefined) =>
    api.post(`/vendor/orders/${orderId}/book-dtdc`, packageDetails);

/** What would be declared to the courier if this order were booked now. */
export const getPackagePreview = (orderId) =>
    api.get(`/vendor/orders/${orderId}/package-preview`);

export const getShippingLabel = (orderId) =>
    api.get(`/vendor/orders/${orderId}/shipping-label`, { responseType: 'blob' });

export const getOrderShipment = (orderId) =>
    api.get(`/vendor/orders/${orderId}/shipment`);

export const syncOrderTracking = (orderId) =>
    api.post(`/vendor/orders/${orderId}/sync-tracking`);

export const checkVendorServiceability = (originPincode, destPincode) =>
    api.get('/vendor/check-serviceability', { params: { originPincode, destPincode } });

/**
 * Retail and wholesale orders this vendor has not yet handed to the courier.
 * Quick Commerce is excluded server-side — it has no courier booking.
 */
export const getOrdersAwaitingShipment = (params = {}) =>
    api.get('/vendor/orders/awaiting-shipment', { params });
