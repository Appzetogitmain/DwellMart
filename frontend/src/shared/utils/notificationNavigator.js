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

  const data = notification.data || {};
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

  // 2. CHAT & SUPPORT TICKET NOTIFICATIONS
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
    if (role === 'delivery') {
      navigate('/delivery/support');
      return;
    }
    if (role === 'vendor') {
      navigate('/vendor/support-tickets');
      return;
    }
    if (role === 'admin') {
      navigate('/admin/support');
      return;
    }
    // Default User App
    navigate('/support');
    return;
  }

  // 3. ORDER NOTIFICATIONS
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
    if (role === 'delivery') {
      if (orderId) {
        navigate(`/delivery/orders/${orderId}`);
      } else {
        navigate('/delivery/orders');
      }
      return;
    }

    if (role === 'vendor') {
      if (orderId) {
        navigate(`/vendor/orders/${orderId}`);
      } else {
        navigate('/vendor/orders');
      }
      return;
    }

    if (role === 'admin') {
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

  // 4. PRODUCT & INVENTORY NOTIFICATIONS
  const productId = data.productId || notification.productId;
  const isProductNotification =
    Boolean(productId) ||
    type.includes('product') ||
    type.includes('stock') ||
    type.includes('inventory') ||
    title.includes('product') ||
    title.includes('stock');

  if (isProductNotification) {
    if (role === 'vendor') {
      if (productId) {
        navigate(`/vendor/products/${productId}`);
      } else {
        navigate('/vendor/products');
      }
      return;
    }

    if (role === 'admin') {
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

  // 5. EARNINGS & PAYOUT NOTIFICATIONS
  if (type.includes('earning') || type.includes('payout') || type.includes('settlement')) {
    if (role === 'vendor') {
      navigate('/vendor/earnings');
      return;
    }
    if (role === 'admin') {
      navigate('/admin/finance');
      return;
    }
  }

  // 6. DEFAULT FALLBACK BY ROLE
  if (role === 'delivery') navigate('/delivery/notifications');
  else if (role === 'vendor') navigate('/vendor/notifications');
  else if (role === 'admin') navigate('/admin/notifications');
  else navigate('/notifications');
};
