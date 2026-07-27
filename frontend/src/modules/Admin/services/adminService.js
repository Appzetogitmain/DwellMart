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

// ─── Products ─────────────────────────────────────────────────────────────────
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

// ─── Categories ───────────────────────────────────────────────────────────────
export const getAllCategories = () =>
    api.get('/admin/categories');

export const getPublicCategories = () =>
    api.get('/categories/all');

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

export const updateVendorStatus = (id, status, reason = '') =>
    api.patch(`/admin/vendors/${id}/status`, { status, reason });

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

export const settleCash = (id, amount) =>
    api.post(`/admin/delivery-boys/${id}/settle-cash`, { amount });

export const updateDeliveryBoy = (id, data) =>
    api.put(`/admin/delivery-boys/${id}`, data);

export const deleteDeliveryBoy = (id) =>
    api.delete(`/admin/delivery-boys/${id}`);

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
export const sendPushNotification = (data) =>
    api.post('/admin/notifications/push', data);

export const sendCustomMessage = (data) =>
    api.post('/admin/notifications/message', data);

// ─── Policies ─────────────────────────────────────────────────────────────────
export const getPolicy = (type) =>
    api.get(`/admin/policies/${type}`);

export const updatePolicy = (type, content) =>
    api.put(`/admin/policies/${type}`, { content });

// ─── Header Notifications ─────────────────────────────────────────────────────
export const getAdminNotifications = (params) => api.get('/admin/notifications', { params });
export const markNotificationAsRead = (id) => api.put(`/admin/notifications/${id}/read`);
export const markAllNotificationsAsRead = () => api.put('/admin/notifications/read-all');
