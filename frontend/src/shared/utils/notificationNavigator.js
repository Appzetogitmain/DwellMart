/**
 * Smart Notification Navigator
 * Resolves target routes for notifications (orders, support chat, products, earnings)
 * and executes navigation + mark as read across all application modules.
 */

export const navigateToNotificationTarget = (notification, navigate, role = 'user', markAsReadFn = null) => {
  if (!notification || !navigate) return;

  // Mark notification as read if callback provided
  if (!notification.isRead && typeof markAsReadFn === 'function') {
    const notifId = notification._id || notification.id;
    if (notifId) {
      markAsReadFn(notifId);
    }
  }

  // Auto-detect role from current window location if role is default ('user')
  let activeRole = role;
  if (!activeRole || activeRole === 'user') {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    if (currentPath.startsWith('/admin')) {
      activeRole = 'admin';
    } else if (currentPath.startsWith('/delivery')) {
      activeRole = 'delivery';
    } else if (currentPath.startsWith('/vendor')) {
      activeRole = 'vendor';
    }
  }

  const rawData = notification.data || {};
  const data = rawData instanceof Map ? Object.fromEntries(rawData) : (typeof rawData === 'object' && rawData !== null ? rawData : {});
  const type = String(notification.type || data.type || '').toLowerCase();
  const title = String(notification.title || '').toLowerCase();
  const message = String(notification.message || '').toLowerCase();

  // 1. Direct URL / Action Link
  const directUrl = notification.actionUrl || notification.url || notification.link || data.actionUrl || data.url || data.link;
  if (directUrl && typeof directUrl === 'string') {
    // Relative routes or full URLs
    if (directUrl.startsWith('/')) {
      navigate(directUrl);
      return;
    }
    try {
      const parsedUrl = new URL(directUrl);
      navigate(parsedUrl.pathname + parsedUrl.search);
      return;
    } catch {
      // Fallthrough if invalid URL
    }
  }

  // 2. VENDOR & CHANNEL REQUEST NOTIFICATIONS
  const isVendorNotification =
    Boolean(data.vendorId || notification.vendorId) ||
    type.includes('vendor') ||
    type.includes('channel') ||
    title.includes('vendor') ||
    title.includes('channel') ||
    message.includes('channel application') ||
    message.includes('selling channel');

  if (isVendorNotification && activeRole === 'admin') {
    const vendorId = data.vendorId || notification.vendorId;
    if (vendorId) {
      const isChannel = Boolean(data.channel) || type.includes('channel') || title.includes('channel') || message.includes('channel');
      navigate(`/admin/vendors/${vendorId}${isChannel ? '?tab=channels' : ''}`);
      return;
    }
    if (title.includes('registration') || message.includes('registered')) {
      navigate('/admin/vendors/pending-approvals');
      return;
    }
  }

  // 3. COD SETTLEMENT & EARNINGS NOTIFICATIONS
  const isSettlementNotification =
    Boolean(data.settlementId) ||
    type.includes('settlement') ||
    type.includes('payout') ||
    title.includes('settlement') ||
    title.includes('cod settlement') ||
    message.includes('settlement') ||
    message.includes('cod settlement');

  if (isSettlementNotification) {
    if (activeRole === 'admin') {
      navigate('/admin/delivery/cash-collection');
      return;
    }
    if (activeRole === 'delivery') {
      navigate('/delivery/cash-settlements');
      return;
    }
    if (activeRole === 'vendor') {
      navigate('/vendor/earnings');
      return;
    }
  }

  // 3. CHAT & SUPPORT TICKET NOTIFICATIONS
  const isChatNotification =
    type.includes('chat') ||
    type.includes('support') ||
    type.includes('ticket') ||
    type.includes('message') ||
    title.includes('ticket') ||
    title.includes('support') ||
    title.includes('message') ||
    message.includes('ticket') ||
    message.includes('support') ||
    message.includes('message');

  if (isChatNotification) {
    if (activeRole === 'delivery') {
      navigate('/delivery/support');
      return;
    }
    if (activeRole === 'vendor') {
      navigate('/vendor/support-tickets');
      return;
    }
    if (activeRole === 'admin') {
      navigate('/admin/support');
      return;
    }
    // Default User App
    navigate('/support');
    return;
  }

  // 4. ORDER NOTIFICATIONS
  // Extract orderId from data, explicit fields, or regex in title/message
  let orderId = data.orderId || data.orderRefId || notification.orderId;

  if (!orderId) {
    const combinedText = `${notification.title || ''} ${notification.message || ''}`;
    // Match QC-..., ORD-..., or 24-char hex Mongo ID
    const match = combinedText.match(/(QC-[A-Z0-9-]+|ORD-[A-Z0-9-]+|[0-9a-fA-F]{24})/);
    if (match && match[1]) {
      orderId = match[1];
    }
  }

  const isOrderNotification =
    Boolean(orderId) ||
    type.includes('order') ||
    type.includes('assignment') ||
    type.includes('delivery') ||
    title.includes('order') ||
    title.includes('assigned') ||
    message.includes('order') ||
    message.includes('assigned');

  if (isOrderNotification) {
    if (activeRole === 'delivery') {
      if (orderId) {
        navigate(`/delivery/orders/${orderId}`);
      } else {
        navigate('/delivery/orders');
      }
      return;
    }

    if (activeRole === 'vendor') {
      if (orderId) {
        navigate(`/vendor/orders/${orderId}`);
      } else {
        navigate('/vendor/orders');
      }
      return;
    }

    if (activeRole === 'admin') {
      if (orderId) {
        navigate(`/admin/orders/${orderId}`);
      } else {
        navigate('/admin/orders');
      }
      return;
    }

    // User App
    if (orderId) {
      navigate(`/orders/${orderId}`);
    } else {
      navigate('/orders');
    }
    return;
  }

  // 5. PRODUCT & INVENTORY NOTIFICATIONS
  const productId = data.productId || notification.productId;
  const isProductNotification =
    Boolean(productId) ||
    type.includes('product') ||
    type.includes('stock') ||
    type.includes('inventory') ||
    title.includes('product') ||
    title.includes('stock');

  if (isProductNotification) {
    if (activeRole === 'vendor') {
      if (productId) {
        navigate(`/vendor/products/${productId}`);
      } else {
        navigate('/vendor/products');
      }
      return;
    }

    if (activeRole === 'admin') {
      if (productId) {
        navigate(`/admin/products/${productId}`);
      } else {
        navigate('/admin/products');
      }
      return;
    }

    if (productId) {
      navigate(`/product/${productId}`);
      return;
    }
  }

  // 6. DEFAULT FALLBACK BY ROLE
  if (activeRole === 'delivery') navigate('/delivery/notifications');
  else if (activeRole === 'vendor') navigate('/vendor/notifications');
  else if (activeRole === 'admin') navigate('/admin/notifications');
  else navigate('/notifications');
};
