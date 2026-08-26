/**
 * Admin API Service
 * All admin API calls go through this file.
 * Uses the single central axios instance from api.js which automatically:
 *  - Attaches Authorization: Bearer <adminToken> for /admin/* routes
 *  - Shows error toasts on failure
 *  - Redirects to /admin/login on 401
 */
import api from '../../../shared/utils/api';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const adminLogin = (email, password) =>
    api.post('/admin/auth/login', { email, password });

export const getAdminProfile = () =>
    api.get('/admin/auth/profile');

// ─── Analytics / Dashboard ────────────────────────────────────────────────────
export const getDashboardStats = () =>
    api.get('/admin/analytics/dashboard');

export const getRevenueData = (period = 'monthly', params = {}) =>
    api.get('/admin/analytics/revenue', { params: { period, ...params } });

export const getOrderStatusBreakdown = () =>
    api.get('/admin/analytics/order-status');

export const getTopProducts = () =>
    api.get('/admin/analytics/top-products');

export const getCustomerGrowth = (period = 'monthly') =>
    api.get('/admin/analytics/customer-growth', { params: { period } });

export const getRecentOrders = () =>
    api.get('/admin/analytics/recent-orders');

export const getSalesData = (period = 'monthly', params = {}) =>
    api.get('/admin/analytics/sales', { params: { period, ...params } });

export const getFinancialSummary = (period = 'monthly', params = {}) =>
    api.get('/admin/analytics/finance-summary', { params: { period, ...params } });

export const getInventoryStats = () =>
    api.get('/admin/analytics/inventory-stats');

/**
 * Platform-wide wholesale marketplace metrics:
 * vendor channel mix, wholesale product count, order split, and bulk revenue.
 */
export const getWholesaleStats = () =>
    api.get('/admin/analytics/wholesale');

// ─── Orders ───────────────────────────────────────────────────────────────────
export const getAllOrders = (params = {}) =>
    api.get('/admin/orders', { params });

export const getOrderById = (id) =>
    api.get(`/admin/orders/${id}`);

export const updateOrderStatus = (id, status) =>
    api.patch(`/admin/orders/${id}/status`, { status });

export const assignDeliveryBoy = (id, deliveryBoyId) =>
    api.patch(`/admin/orders/${id}/assign-delivery`, { deliveryBoyId });

export const deleteOrder = (id) =>
    api.delete(`/admin/orders/${id}`);

// ─── DTDC Shipments ───────────────────────────────────────────────────────────
export const getShipments = (params = {}) =>
    api.get('/admin/shipments', { params });

export const getShipmentById = (id) =>
    api.get(`/admin/shipments/${id}`);

export const bookDtdcShipment = (orderId, packageDetails = undefined) =>
    api.post(`/admin/orders/${orderId}/book-dtdc`, packageDetails);

/** What would be declared to the courier if this order were booked now. */
export const getPackagePreview = (orderId) =>
    api.get(`/admin/orders/${orderId}/package-preview`);

/** Courier-eligible products whose parcel data is an estimate, not a measurement. */
export const getProductsMissingShipping = (params = {}) =>
    api.get('/admin/products/missing-shipping', { params });

export const cancelDtdcShipment = (orderId) =>
    api.post(`/admin/orders/${orderId}/cancel-shipment`);

export const getShippingLabel = (orderId) =>
    api.get(`/admin/orders/${orderId}/shipping-label`, { responseType: 'blob' });

export const syncOrderTracking = (orderId) =>
    api.post(`/admin/orders/${orderId}/sync-tracking`);

export const getOrderShipment = (orderId) =>
    api.get(`/admin/orders/${orderId}/shipment`);

export const checkServiceability = (originPincode, destPincode) =>
    api.get('/admin/check-serviceability', { params: { originPincode, destPincode } });

/** Retail/wholesale orders that are ready to ship with no courier booking. */
export const getOrdersAwaitingBooking = (params = {}) =>
    api.get('/admin/shipments/awaiting-booking', { params });

// ─── Products / Catalog ───────────────────────────────────────────────────────
export const getAllProducts = (params = {}) =>
    api.get('/admin/products', { params });

export const getProductById = (id) =>
    api.get(`/admin/products/${id}`);

export const createProduct = (data) =>
    api.post('/admin/products', data);

export const updateProduct = (id, data) =>
    api.put(`/admin/products/${id}`, data);

export const deleteProduct = (id) =>
    api.delete(`/admin/products/${id}`);

export const getTaxPricingRules = () =>
    api.get('/admin/products/tax-pricing-rules');

export const updateTaxPricingRules = (data) =>
    api.put('/admin/products/tax-pricing-rules', data);

// Bulk Product Upload & Export (Admin)
export const validateBulkProductUpload = (formData) =>
    api.post('/admin/products/bulk-upload/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

export const processBulkProductUpload = (payload) =>
    api.post('/admin/products/bulk-upload/process', payload);

export const getBulkProductJobProgress = (jobId) =>
    api.get(`/admin/products/bulk-upload/job/${jobId}`);

export const cancelBulkProductJob = (jobId) =>
    api.post(`/admin/products/bulk-upload/job/${jobId}/cancel`);

export const getBulkProductImportHistory = (params = {}) =>
    api.get('/admin/products/bulk-upload/history', { params });

export const downloadProductTemplate = async (format = 'excel') => {
    const response = await api.get(`/admin/products/template/${format}`, { responseType: 'blob' });
    const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([response], { type: mimeType });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `DwellMart_Bulk_Product_Template.${format === 'csv' ? 'csv' : 'xlsx'}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
};

export const exportProductsCatalog = async (format = 'xlsx', vendorId = null) => {
    const response = await api.get('/admin/products/export', {
        params: { format, vendorId },
        responseType: 'blob',
    });
    const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([response], { type: mimeType });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `DwellMart_Products_Export.${format === 'csv' ? 'csv' : 'xlsx'}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
};

// ─── Categories ───────────────────────────────────────────────────────────────
/**
 * Admin manages one category tree at a time. Omitting `experience` returns the
 * Marketplace tree, preserving existing behaviour for all current callers.
 */
export const getAllCategories = (experience) =>
    api.get('/admin/categories', experience ? { params: { experience } } : undefined);

export const getPublicCategories = (experience) =>
    api.get('/categories', experience ? { params: { experience } } : undefined);

/**
 * Quick Commerce category tree, for product forms.
 * Uses the public endpoint with an explicit experience so it works for both
 * vendors and admins — the resolveExperience middleware accepts the query param.
 */
export const getQuickCommerceCategories = () =>
    api.get('/categories/all', { params: { experience: 'quick_commerce' } });

export const createCategory = (data) =>
    api.post('/admin/categories', data);

export const updateCategory = (id, data) =>
    api.put(`/admin/categories/${id}`, data);

export const deleteCategory = (id) =>
    api.delete(`/admin/categories/${id}`);

export const reorderCategories = (categoryIds) =>
    api.patch('/admin/categories/reorder', { categoryIds });

export const seedCategoriesApi = () =>
    api.post('/admin/categories/seed');

// ─── Brands ───────────────────────────────────────────────────────────────────
export const getAllBrands = () =>
    api.get('/admin/brands');

export const getPublicBrands = () =>
    api.get('/brands/all');

export const createBrand = (data) =>
    api.post('/admin/brands', data);

export const updateBrand = (id, data) =>
    api.put(`/admin/brands/${id}`, data);

export const deleteBrand = (id) =>
    api.delete(`/admin/brands/${id}`);

// ─── Vendors ──────────────────────────────────────────────────────────────────
export const getAllVendors = (params = {}) =>
    api.get('/admin/vendors', { params });

export const getVendorById = (id) =>
    api.get(`/admin/vendors/${id}`);

export const updateVendorStatus = (id, status, reason = '', vendorType = null, approvedChannels = null) => {
    const payload = { status, reason };
    if (vendorType) payload.vendorType = vendorType;
    if (approvedChannels?.length) payload.approvedChannels = approvedChannels;
    return api.patch(`/admin/vendors/${id}/status`, payload);
};

export const deleteVendor = (id) =>
    api.delete(`/admin/vendors/${id}`);

export const updateVendorChannelStatus = (id, channel, payload) =>
    api.patch(`/admin/vendors/${id}/channels/${channel}/status`, payload);

/** Legacy informational classification only; never grants channel access. */
export const updateVendorType = (id, vendorType) =>
    api.patch(`/admin/vendors/${id}/vendor-type`, { vendorType });

/**
 * Grant or revoke a vendor's Quick Commerce capability, with optional admin
 * overrides for an unrealistic radius or preparation time.
 */
export const updateVendorQuickCommerce = (id, payload) =>
    api.patch(`/admin/vendors/${id}/quick-commerce`, payload);

export const updateCommissionRate = (id, commissionRate) =>
    api.patch(`/admin/vendors/${id}/commission`, { commissionRate });

export const getVendorCommissions = (id, params = {}) =>
    api.get(`/admin/vendors/${id}/commissions`, { params });

export const getVendorDocuments = (id) =>
    api.get(`/admin/vendors/${id}/documents`);

// ─── Customers ────────────────────────────────────────────────────────────────
export const getAllCustomers = (params = {}) =>
    api.get('/admin/customers', { params });

export const getCustomerById = (id) =>
    api.get(`/admin/customers/${id}`);

export const updateCustomer = (id, data) =>
    api.put(`/admin/customers/${id}`, data);

export const updateCustomerStatus = (id, isActive) =>
    api.patch(`/admin/customers/${id}/status`, { isActive });

export const deleteCustomerAddress = (customerId, addressId) =>
    api.delete(`/admin/customers/${customerId}/addresses/${addressId}`);

export const getCustomerOrders = (id, params = {}) =>
    api.get(`/admin/customers/${id}/orders`, { params });

export const getCustomerTransactions = (params = {}) =>
    api.get('/admin/customers/transactions', { params });

export const getCustomerAddresses = (params = {}) =>
    api.get('/admin/customers/addresses', { params });

// ─── Delivery Boys ────────────────────────────────────────────────────────────
export const getAllDeliveryBoys = (params = {}) =>
    api.get('/admin/delivery-boys', { params });

export const createDeliveryBoy = (data) =>
    api.post('/admin/delivery-boys', data);

export const getDeliveryBoyById = (id) =>
    api.get(`/admin/delivery-boys/${id}`);

export const updateDeliveryBoyStatus = (id, isActive) =>
    api.patch(`/admin/delivery-boys/${id}/status`, { isActive });

export const updateDeliveryBoyApplicationStatus = (id, applicationStatus, reason = '') =>
    api.patch(`/admin/delivery-boys/${id}/application-status`, { applicationStatus, reason });

export const settleCash = (id, payload) =>
    api.post(`/admin/delivery-boys/${id}/settle-cash`, typeof payload === 'object' ? payload : { amount: payload });

export const getDeliverySettlements = (params) =>
    api.get('/admin/delivery-settlements', { params });

export const rejectDeliveryCashSettlement = (id, reason) =>
    api.post(`/admin/delivery-settlements/${id}/reject`, { reason });

export const cancelDeliveryCashSettlement = (id, reason) =>
    api.post(`/admin/delivery-settlements/${id}/cancel`, { reason });

export const updateDeliveryBoy = (id, data) =>
    api.put(`/admin/delivery-boys/${id}`, data);

export const deleteDeliveryBoy = (id) =>
    api.delete(`/admin/delivery-boys/${id}`);

export const updateDeliveryBoyExperiences = (id, experiences) =>
    api.put(`/admin/delivery-boys/${id}/experiences`, { experiences });

export const bulkUpdateDeliveryBoyExperiences = (deliveryBoyIds, experiences) =>
    api.put('/admin/delivery-boys/bulk-experiences', { deliveryBoyIds, experiences });

// ─── Return Requests ──────────────────────────────────────────────────────────
export const getAllReturnRequests = (params = {}) =>
    api.get('/admin/return-requests', { params });

export const getReturnRequestById = (id) =>
    api.get(`/admin/return-requests/${id}`);

export const updateReturnRequestStatus = (id, statusOrPayload, adminNote = '') => {
    const payload =
        typeof statusOrPayload === 'object' && statusOrPayload !== null
            ? statusOrPayload
            : { status: statusOrPayload, adminNote };
    return api.patch(`/admin/return-requests/${id}/status`, payload);
};

// ——— Reviews —————————————————————————————————————————————————————————————————————
export const getAllReviews = (params = {}) =>
    api.get('/admin/reviews', { params });

export const updateReviewStatus = (id, status) =>
    api.patch(`/admin/reviews/${id}/status`, { status });

export const deleteReview = (id) =>
    api.delete(`/admin/reviews/${id}`);

// ——— Support Tickets —————————————————————————————————————————————————————————————
export const getAllTickets = (params = {}) =>
    api.get('/admin/support/tickets', { params });

export const getTicketById = (id) =>
    api.get(`/admin/support/tickets/${id}`);

export const updateTicketStatus = (id, status) =>
    api.patch(`/admin/support/tickets/${id}/status`, { status });

export const addTicketMessage = (id, message) =>
    api.post(`/admin/support/tickets/${id}/messages`, { message });

export const getAllTicketTypes = (params = {}) =>
    api.get('/admin/support/ticket-types', { params });

export const createTicketType = (data) =>
    api.post('/admin/support/ticket-types', data);

export const updateTicketType = (id, data) =>
    api.put(`/admin/support/ticket-types/${id}`, data);

export const deleteTicketType = (id) =>
    api.delete(`/admin/support/ticket-types/${id}`);

// ─── Reports ──────────────────────────────────────────────────────────────────
export const getSalesReport = (params = {}) =>
    api.get('/admin/reports/sales', { params });

export const getInventoryReport = (params = {}) =>
    api.get('/admin/reports/inventory', { params });

// ─── Settings ─────────────────────────────────────────────────────────────────
export const getSettings = () =>
    api.get('/admin/settings');

export const updateSettings = (data) =>
    api.put('/admin/settings', data);

// ─── Marketing & Promotions ──────────────────────────────────────────────────
// Coupons
export const getAllCoupons = (params) => api.get('/admin/marketing/coupons', { params });
export const createCoupon = (data) => api.post('/admin/marketing/coupons', data);
export const updateCoupon = (id, data) => api.put(`/admin/marketing/coupons/${id}`, data);
export const deleteCoupon = (id) => api.delete(`/admin/marketing/coupons/${id}`);

// Banners
export const getAllBanners = () => api.get('/admin/marketing/banners');
export const createBanner = (data) => api.post('/admin/marketing/banners', data);
export const reorderBanners = (items) => api.patch('/admin/marketing/banners/reorder', { items });
export const updateBanner = (id, data) => api.put(`/admin/marketing/banners/${id}`, data);
export const deleteBanner = (id) => api.delete(`/admin/marketing/banners/${id}`);

// Testimonials
export const getAllTestimonials = () => api.get('/admin/marketing/testimonials');
export const createTestimonial = (data) => api.post('/admin/marketing/testimonials', data);
export const updateTestimonial = (id, data) => api.put(`/admin/marketing/testimonials/${id}`, data);
export const deleteTestimonial = (id) => api.delete(`/admin/marketing/testimonials/${id}`);

// Campaigns
export const getAllCampaigns = (params) => api.get('/admin/marketing/campaigns', { params });
export const createCampaign = (data) => api.post('/admin/marketing/campaigns', data);
export const updateCampaign = (id, data) => api.put(`/admin/marketing/campaigns/${id}`, data);
export const deleteCampaign = (id) => api.delete(`/admin/marketing/campaigns/${id}`);

// Image Uploads
export const uploadAdminImage = (file, folder = 'general', publicId) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folder', folder);
    if (publicId) {
        formData.append('publicId', publicId);
    }
    return api.post('/admin/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * Broadcast a push notification to a target group.
 * POST /api/admin/notifications/broadcast-push
 * @param {Object} data - { title, message, target, category, priority, actionUrl, metadata }
 */
export const broadcastPushNotification = (data) =>
    api.post('/admin/notifications/broadcast-push', data);

// ─── Custom Message Templates ─────────────────────────────────────────────────

export const getCustomMessages = (params = {}) =>
    api.get('/admin/notifications/custom-messages', { params });

export const createCustomMessage = (data) =>
    api.post('/admin/notifications/custom-messages', data);

export const updateCustomMessage = (id, data) =>
    api.put(`/admin/notifications/custom-messages/${id}`, data);

export const deleteCustomMessage = (id) =>
    api.delete(`/admin/notifications/custom-messages/${id}`);

export const toggleCustomMessage = (id) =>
    api.patch(`/admin/notifications/custom-messages/${id}/toggle`);

// ─── Header Notifications ─────────────────────────────────────────────────────
export const getAdminNotifications = (params) => api.get('/admin/notifications', { params });
export const markNotificationAsRead = (id) => api.put(`/admin/notifications/${id}/read`);
export const markAllNotificationsAsRead = () => api.put('/admin/notifications/read-all');

export const getPolicy = (type) =>
    api.get(`/admin/policies/${type}`);

export const updatePolicy = (type, content) =>
    api.put(`/admin/policies/${type}`, { content });

// ─── Sub Admin Management ─────────────────────────────────────────────────────

export const getAllSubAdmins = (params = {}) => api.get('/admin/subadmins', { params });
export const getSubAdminById = (id) => api.get(`/admin/subadmins/${id}`);
export const createSubAdmin = (data) => api.post('/admin/subadmins', data);
export const updateSubAdmin = (id, data) => api.put(`/admin/subadmins/${id}`, data);
export const toggleSubAdminStatus = (id, status) => api.patch(`/admin/subadmins/${id}/status`, { status });
export const resetSubAdminPassword = (id, data) => api.post(`/admin/subadmins/${id}/reset-password`, data);
export const deleteSubAdmin = (id) => api.delete(`/admin/subadmins/${id}`);
export const getSubAdminLogs = (params = {}) => api.get('/admin/subadmins/logs', { params });


// ─── Rider Earnings Wallet & Payouts ─────────────────────────────────────────

export const getRiderWithdrawals = (params) =>
    api.get('/admin/rider-withdrawals', { params });

export const approveRiderWithdrawal = (id, notes = '') =>
    api.post(`/admin/rider-withdrawals/${id}/approve`, { notes });

export const rejectRiderWithdrawal = (id, reason) =>
    api.post(`/admin/rider-withdrawals/${id}/reject`, { reason });

export const markRiderWithdrawalPaid = (id, payload) =>
    api.post(`/admin/rider-withdrawals/${id}/mark-paid`, payload);

export const markRiderWithdrawalFailed = (id, reason) =>
    api.post(`/admin/rider-withdrawals/${id}/mark-failed`, { reason });

export const getRiderWallets = (params) =>
    api.get('/admin/rider-wallets', { params });

export const getRiderWalletDetail = (deliveryBoyId) =>
    api.get(`/admin/rider-wallets/${deliveryBoyId}`);

export const adjustRiderWallet = (deliveryBoyId, payload) =>
    api.post(`/admin/rider-wallets/${deliveryBoyId}/adjust`, payload);

export const toggleRiderPayoutBlock = (deliveryBoyId, payload) =>
    api.post(`/admin/rider-wallets/${deliveryBoyId}/block`, payload);

export const rebuildRiderWallet = (deliveryBoyId) =>
    api.post(`/admin/rider-wallets/${deliveryBoyId}/rebuild`);

export const verifyRiderPayoutDetails = (deliveryBoyId) =>
    api.post(`/admin/rider-wallets/${deliveryBoyId}/verify-payout-details`);

export const adjustRiderCash = (deliveryBoyId, payload) =>
    api.post(`/admin/rider-wallets/${deliveryBoyId}/adjust-cash`, payload);

export const reverseRiderEarning = (orderId, reason) =>
    api.post(`/admin/rider-earnings/${orderId}/reverse`, { reason });

export const getRiderWalletAnalytics = (params) =>
    api.get('/admin/rider-wallets/analytics', { params });

export const getRiderWalletDrift = (params) =>
    api.get('/admin/rider-wallets/drift', { params });

export const getRiderRateCards = (params) =>
    api.get('/admin/rider-rate-cards', { params });

export const createRiderRateCard = (payload) =>
    api.post('/admin/rider-rate-cards', payload);

export const deactivateRiderRateCard = (id) =>
    api.post(`/admin/rider-rate-cards/${id}/deactivate`);
