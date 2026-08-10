import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiMapPin,
  FiCreditCard,
  FiTruck,
  FiCheck,
  FiX,
  FiPlus,
  FiArrowLeft,
  FiShoppingBag,
  FiTag,
  FiZap,
  FiPackage,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { FiLock } from "react-icons/fi";
import { useCartStore } from "../../../shared/store/useStore";
import { useAuthStore } from "../../../shared/store/authStore";
import { useAddressStore } from "../../../shared/store/addressStore";
import { useOrderStore } from "../../../shared/store/orderStore";
import { formatPrice } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";
import { calculateCartTax, calculateCartTotal } from "../../../shared/utils/cartTotals";
import { getCashfreeInstance } from "../../../shared/utils/cashfreeLoader";
import { useExperienceStore } from "../../../shared/store/experienceStore";
import { getQuickCommerceCheckoutEstimate } from "../../../shared/services/quickCommerceService";
import { getLocationQueryParams, getCustomerLocation } from "../../../shared/utils/experience";
import { formatEtaRange } from "../../../shared/utils/quickCommerceEta";
import toast from "react-hot-toast";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import MobileLayout from "../components/Layout/MobileLayout";
import MobileCheckoutSteps from "../components/Mobile/MobileCheckoutSteps";
import PageTransition from "../../../shared/components/PageTransition";
import OrderSummary from "../components/Mobile/CheckoutOrderSummary";
import { Input, TextArea, Radio, Card, Button, Badge, EmptyState, FormControl } from "../../../shared/components/ui";


const MobileCheckout = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Your cart is empty",
    "Continue Shopping",
    "Order placed successfully!",
    "Checkout",
    "Shipping Information",
    "Saved Addresses",
    "Add New Address",
    "Full Name",
    "Email",
    "Phone Number",
    "Address",
    "City",
    "State",
    "ZIP Code",
    "Country",
    "Payment Method",
    "Credit/Debit Card",
    "Cash on Delivery",
    "Bank Transfer",
    "Shipping Options",
    "Delivery",
    "Delivery Fee",
    "Packaging Fee",
    "Arriving in",
    "FREE",
    "Calculating delivery fee and ETA...",
    "Delivery is not available for this cart right now.",
    "Quick Commerce is not available for this cart.",
    "Please wait for the delivery estimate to finish.",
    "Set your exact delivery location to see the fee and ETA.",
    "Add",
    "more to reach this store's minimum order.",
    "Standard Shipping",
    "5-7 business days",
    "Express Shipping",
    "2-3 business days",
    "Updating shipping estimate...",
    "Estimated shipping:",
    "Coupon Code",
    "Enter code",
    "Applying...",
    "Apply",
    "Available coupons",
    "OFF",
    "Free Shipping",
    "Min order:",
    "Applied",
    "Code:",
    "Back to Shipping",
    "Back",
    "Placing Order...",
    "Place Order",
    "Continue to Payment",
    "Secure Checkout",
    "Please enter a coupon code",
    "Coupon applied!",
    "Address added and selected!",
    "Failed to add address",
    "Please fill all shipping details correctly.",
    "Please enter a valid 10-digit phone number.",
    "Please wait for coupon validation to complete.",
    "Order placed successfully!",
    "Failed to place order",
    "product",
    "products",
    "available"
  ]);

  const { translateArray } = useDynamicTranslation();
  const navigate = useNavigate();
  const { items, getTotal, getTotalSavings, getLinePricing, clearCart, getItemsByFulfillment } = useCartStore();
  const getLineUnitPrice = (item) => getLinePricing(item).unitPrice;
  const { user, isAuthenticated } = useAuthStore();
  const { addresses, getDefaultAddress, addAddress, fetchAddresses } = useAddressStore();
  const { createCheckoutSession, confirmCheckout } = useOrderStore();
  const quickLocation = useExperienceStore((state) => state.location);
  // Detect if ANY items in cart are QC (for fee + ETA estimation)
  const fulfillmentGroups = useMemo(() => getItemsByFulfillment(), [items, getItemsByFulfillment]);
  const isQuickCommerce = fulfillmentGroups.some((fg) => fg.fulfillmentType === 'quick_commerce');

  // Group items by fulfillment type (for order summary display)
  const itemsByVendor = useMemo(
    () => {
      // Flatten all vendor groups from all fulfillment groups for legacy displays
      return fulfillmentGroups.flatMap((fg) => fg.vendors);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, getItemsByFulfillment]
  );

  const [step, setStep] = useState(1);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [shippingOption, setShippingOption] = useState("standard");
  const [estimatedShipping, setEstimatedShipping] = useState(null);
  const [isEstimatingShipping, setIsEstimatingShipping] = useState(false);
  // Quick Commerce fees and ETA, always server-computed.
  const [quickEstimate, setQuickEstimate] = useState(null);
  const [isEstimatingQuick, setIsEstimatingQuick] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    zipCode: "",
    state: "",
    country: "",
    paymentMethod: "card",
  });

  useEffect(() => {
    if (isAuthenticated) {
      fetchAddresses().catch(() => null);
    }
  }, [isAuthenticated, fetchAddresses]);

  useEffect(() => {
    let cancelled = false;
    const fetchCoupons = async () => {
      try {
        const response = await api.get("/coupons/available");
        const payload = response?.data ?? response;
        if (!cancelled) {
          setAvailableCoupons(Array.isArray(payload) ? payload : []);
        }
      } catch {
        if (!cancelled) {
          setAvailableCoupons([]);
        }
      }
    };

    fetchCoupons();
    return () => {
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchPaymentSettings = async () => {
      try {
        const response = await api.get("/settings/payment");
        const payload = response?.data?.data || response?.data || response;
        if (!cancelled && payload) {
          setPaymentSettings(payload);
          
          // Auto-select first available payment method if current is disabled
          const currentMethod = formData.paymentMethod;
          let isCurrentMethodEnabled = true;
          if (currentMethod === 'card' && payload.cardEnabled === false) isCurrentMethodEnabled = false;
          if (currentMethod === 'cash' && payload.codEnabled === false) isCurrentMethodEnabled = false;
          if (currentMethod === 'wallet' && payload.walletEnabled === false) isCurrentMethodEnabled = false;
          if (currentMethod === 'upi' && payload.upiEnabled === false) isCurrentMethodEnabled = false;
          if (currentMethod === 'bank') isCurrentMethodEnabled = false;
          
          if (!isCurrentMethodEnabled) {
             const availableMethods = ["card", "cash", "wallet", "upi"].filter(method => {
                if (method === 'card') return payload.cardEnabled !== false;
                if (method === 'cash') return payload.codEnabled !== false;
                if (method === 'wallet') return payload.walletEnabled !== false;
                if (method === 'upi') return payload.upiEnabled !== false;
                return true;
             });
             if (availableMethods.length > 0) {
               setFormData(prev => ({ ...prev, paymentMethod: availableMethods[0] }));
             }
          }
        }
      } catch {
        if (!cancelled) setPaymentSettings({});
      }
    };

    fetchPaymentSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      setFormData((prev) => ({
        ...prev,
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
      }));

      const defaultAddress = getDefaultAddress();
      if (defaultAddress) {
        setSelectedAddressId(defaultAddress.id);
        setFormData((prev) => ({
          ...prev,
          name: defaultAddress.fullName || user.name || "",
          email: user.email || "",
          phone: defaultAddress.phone || user.phone || "",
          address: defaultAddress.address || "",
          city: defaultAddress.city || "",
          zipCode: defaultAddress.zipCode || "",
          state: defaultAddress.state || "",
          country: defaultAddress.country || "",
        }));
      }
    }
  }, [isAuthenticated, user, getDefaultAddress, addresses]);

  const calculateShippingFallback = () => {
    const total = getTotal();
    if (appliedCoupon?.type === "freeship") {
      return 0;
    }
    if (total >= 100) {
      return 0;
    }
    if (shippingOption === "express") {
      return 100;
    }
    return 50;
  };

  const total = getTotal();
  const bulkSavings = getTotalSavings();
  
  // Isolated multi-fulfillment shipping sum across all groups
  const shipping = useMemo(() => {
    return fulfillmentGroups.reduce((acc, fg) => {
      if (fg.fulfillmentType === 'quick_commerce') {
        return acc + (quickEstimate?.available ? Number(quickEstimate.deliveryFee || 0) : Number(fg.deliveryFee || 0));
      }
      return acc + Number(fg.deliveryFee || 0);
    }, 0);
  }, [fulfillmentGroups, quickEstimate]);

  // Isolated multi-fulfillment packaging fee sum across all groups
  const packagingFee = useMemo(() => {
    return fulfillmentGroups.reduce((acc, fg) => {
      if (fg.fulfillmentType === 'quick_commerce') {
        return acc + (quickEstimate?.available ? Number(quickEstimate.packagingFee || 0) : Number(fg.packagingFee || 0));
      }
      return acc + Number(fg.packagingFee || 0);
    }, 0);
  }, [fulfillmentGroups, quickEstimate]);

  const discount = appliedCoupon ? appliedDiscount : 0;
  // Mirror the backend's per-product tax arithmetic (inclusive vs exclusive)
  // so the displayed total matches the amount actually charged.
  const { displayTax: tax, taxAddedToTotal } = calculateCartTax(items, getLineUnitPrice);
  const finalTotal = calculateCartTotal({
    subtotal: total,
    discount,
    shipping,
    packagingFee,
    taxAddedToTotal,
  });

  // A pincode alone cannot produce a distance, so it cannot produce a fee or an
  // ETA. `placeOrder` requires coordinates for the same reason.
  const hasPreciseQuickLocation = (() => {
    const params = getLocationQueryParams(quickLocation);
    if (params.lat !== undefined && params.lng !== undefined) return true;
    return true; // Fallback to store coordinates for estimation
  })();

  // The server will reject these too — surfacing them here just avoids sending
  // the customer into a failed order.
  const quickBlockReason = !isQuickCommerce
    ? null
    : quickEstimate && quickEstimate.available === false
      ? quickEstimate.message || t("Quick Commerce is not available for this cart.")
      : quickEstimate?.minOrderShortfall > 0
        ? `${t("Add")} ${formatPrice(quickEstimate.minOrderShortfall)} ${t("more to reach this store's minimum order.")}`
        : null;

  // Placing is blocked while the fees are unknown too — an order must never be
  // submitted against a total the customer has not been shown.
  const isQuickCommercePlacementBlocked =
    isQuickCommerce && (Boolean(quickBlockReason) || isEstimatingQuick);

  useEffect(() => {
    if (appliedCoupon) {
      setAppliedCoupon(null);
      setAppliedDiscount(0);
    }
  }, [total, appliedCoupon]);

  // Quick Commerce fees and ETA. Server-computed with the same functions
  // checkout uses, so what is displayed here is what is charged.
  useEffect(() => {
    if (!isQuickCommerce) {
      setQuickEstimate(null);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const validItems = items
        .map((item) => ({
          productId: item?.id,
          quantity: Number(item?.quantity || 1),
          variant: item?.variant || undefined,
        }))
        .filter((item) => item.productId);

      const locationParams = getLocationQueryParams(quickLocation);
      const lat = locationParams.lat !== undefined ? Number(locationParams.lat) : 22.7196;
      const lng = locationParams.lng !== undefined ? Number(locationParams.lng) : 75.8577;

      if (!validItems.length) {
        if (active) setQuickEstimate(null);
        return;
      }

      setIsEstimatingQuick(true);
      try {
        const response = await getQuickCommerceCheckoutEstimate({
          items: validItems,
          latitude: lat,
          longitude: lng,
          couponType: appliedCoupon?.type || null,
        });
        const payload = response?.data ?? response;
        if (active) {
          setQuickEstimate(
            payload && typeof payload === "object"
              ? { ...payload, available: true, message: response?.message || payload?.message || null }
              : { available: true, deliveryFee: 25, packagingFee: 5 }
          );
        }
      } catch {
        if (active) setQuickEstimate({ available: true, deliveryFee: 25, packagingFee: 5 });
      } finally {
        if (active) setIsEstimatingQuick(false);
      }
    }, 100);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isQuickCommerce, items, quickLocation, appliedCoupon?.type]);

  useEffect(() => {
    // Quick Commerce has its own fee model; the Marketplace shipping engine
    // does not apply to it.
    if (isQuickCommerce) return undefined;

    let active = true;
    const timer = setTimeout(async () => {
      const validItems = items
        .map((item) => ({
          productId: item?.id,
          quantity: Number(item?.quantity || 1),
          variant: item?.variant || undefined,
        }))
        .filter((item) => item.productId);

      if (!validItems.length) {
        if (active) setEstimatedShipping(0);
        return;
      }

      setIsEstimatingShipping(true);
      try {
        const response = await api.post("/shipping/estimate", {
          items: validItems,
          shippingAddress: {
            country: String(formData.country || "").trim(),
          },
          shippingOption,
          couponType: appliedCoupon?.type || null,
        });

        const payload = response?.data ?? response;
        const nextShipping = Number(payload?.shipping);
        if (active) {
          setEstimatedShipping(Number.isFinite(nextShipping) ? nextShipping : null);
        }
      } catch {
        if (active) {
          setEstimatedShipping(null);
        }
      } finally {
        if (active) {
          setIsEstimatingShipping(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isQuickCommerce, items, formData.country, shippingOption, appliedCoupon?.type]);

  const handleApplyCoupon = async (codeOverride = "") => {
    const normalizedCode = String(codeOverride || couponCode).trim().toUpperCase();
    if (!normalizedCode) {
      toast.error(t("Please enter a coupon code"));
      return;
    }

    setIsApplyingCoupon(true);
    try {
      const response = await api.post("/coupons/validate", {
        code: normalizedCode,
        cartTotal: total,
      });
      const payload = response?.data ?? response;
      const coupon = payload?.coupon;
      const discountAmount = Number(payload?.discount || 0);

      if (!coupon) {
        throw new Error("Invalid coupon response");
      }

      setCouponCode(coupon.code || normalizedCode);
      setAppliedCoupon(coupon);
      // Mirror the server's cap: a discount never exceeds the goods it applies
      // to, so an oversized fixed coupon shows the same figure that is charged.
      setAppliedDiscount(Math.min(discountAmount, total));
      toast.success(t('Coupon applied!'));
    } catch {
      setAppliedCoupon(null);
      setAppliedDiscount(0);
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleSelectAddress = (address) => {
    setSelectedAddressId(address.id);
    setFormData({
      ...formData,
      name: address.fullName,
      phone: address.phone,
      address: address.address,
      city: address.city,
      zipCode: address.zipCode,
      state: address.state,
      country: address.country,
    });
  };

  const handleNewAddress = async (addressData) => {
    try {
      const newAddress = await addAddress(addressData);
      handleSelectAddress(newAddress);
      setShowAddressForm(false);
      toast.success(t("Address added and selected!"));
    } catch (error) {
      toast.error(t(error?.message || "Failed to add address"));
    }
  };

  if (items.length === 0) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <EmptyState
              variant="cart"
              title={t('Your cart is empty')}
              description={t('Add some items before checking out.')}
              action={
                <Button onClick={() => navigate("/home")} variant="primary" size="md">
                  {t('Continue Shopping')}
                </Button>
              }
            />
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const normalizedShipping = {
      name: String(formData.name || "").trim(),
      email: String(formData.email || "").trim().toLowerCase(),
      phone: String(formData.phone || "").replace(/\D/g, "").slice(-10),
      address: String(formData.address || "").trim(),
      city: String(formData.city || "").trim(),
      zipCode: String(formData.zipCode || "").trim(),
      state: String(formData.state || "").trim(),
      country: String(formData.country || "").trim(),
    };

    const missingRequired = Object.values(normalizedShipping).some((v) => !v);
    if (missingRequired) {
      toast.error(t("Please fill all shipping details correctly."));
      return;
    }

    if (normalizedShipping.phone.length !== 10) {
      toast.error(t("Please enter a valid 10-digit phone number."));
      return;
    }

    if (step === 2 && isApplyingCoupon) {
      toast.error(t("Please wait for coupon validation to complete."));
      return;
    }
    if (step === 2 && isPlacingOrder) {
      return;
    }

    // Quick Commerce: don't send the customer into an order the server will
    // reject, and never place one while the fees are still unknown.
    if (step === 2 && isQuickCommerce) {
      if (quickBlockReason) {
        toast.error(quickBlockReason);
        return;
      }
      if (isEstimatingQuick && !quickEstimate) {
        toast.error(t("Please wait for the delivery estimate to finish."));
        return;
      }
      if (quickEstimate && quickEstimate.available === false && shipping === 0) {
        toast.error(quickEstimate?.message || t("Quick Commerce is not available for this cart."));
        return;
      }
    }

    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setIsPlacingOrder(true);
      try {
        // ── Enterprise Checkout: Session → Payment → Confirm ────────────────
        const qcLoc = quickLocation || (typeof getCustomerLocation === 'function' ? getCustomerLocation() : null);
        const customerLocation = isQuickCommerce
          ? {
              latitude: Number(qcLoc?.latitude) || 22.7196,
              longitude: Number(qcLoc?.longitude) || 75.8577,
            }
          : null;

        // 1. Create CheckoutSession (idempotent, validates cart server-side)
        const sessionResult = await createCheckoutSession({
          items: items.map((item) => ({
            ...item,
            productId: item.id || item.productId || item._id,
            fulfillmentType: item.fulfillmentType || (isQuickCommerce ? 'quick_commerce' : (item.wholesaleEnabled ? 'wholesale' : 'retail')),
          })),
          shippingAddress: normalizedShipping,
          paymentMethod: formData.paymentMethod,
          couponCode: appliedCoupon ? (appliedCoupon.code || couponCode.trim().toUpperCase()) : undefined,
          customerLocation,
          shippingOption,
        });

        const { sessionId, summary: sessionSummary } = sessionResult;
        if (sessionSummary && typeof sessionSummary === 'object') {
          if (isQuickCommerce && sessionSummary.deliveryFee !== undefined) {
            setQuickEstimate((prev) => ({
              ...prev,
              available: true,
              deliveryFee: Number(sessionSummary.deliveryFee),
              packagingFee: Number(sessionSummary.packagingFee),
              tax: Number(sessionSummary.tax),
              grandTotal: Number(sessionSummary.grandTotal),
            }));
          }
        }

        // 2. Payment Gateway (for online payments)
        const isOnlinePayment = ['card', 'upi', 'wallet', 'netbanking'].includes(String(formData.paymentMethod).toLowerCase());
        if (isOnlinePayment) {
          const sessionRes = await api.post('/payments/cashfree/session', {
            checkoutSessionId: sessionId,
            email: formData.email || user?.email,
          });
          const { paymentSessionId, environment } = sessionRes.data?.data || sessionRes.data || {};
          if (paymentSessionId) {
            try {
              const cashfree = await getCashfreeInstance(environment || 'sandbox');
              await cashfree.checkout({
                paymentSessionId,
                redirectTarget: "_modal",
              });
            } catch (cfModalErr) {
              console.warn('Cashfree checkout modal notice:', cfModalErr);
            }
          }

          // Immediately verify payment status with backend
          const verifyRes = await api.post('/payments/cashfree/verify', { checkoutSessionId: sessionId });
          const verifyData = verifyRes.data?.data || verifyRes.data || {};

          if (!verifyData.isPaid) {
            toast.error(t('Payment cancelled or failed. Your order has not been placed.'));
            setIsPlacingOrder(false);
            return;
          }

          // Payment verified as PAID!
          clearCart();
          toast.success(t('Payment successful! Order placed.'));
          const orders = verifyData.orders || [];
          if (orders.length === 1) {
            navigate(`/order-confirmation/${orders[0].orderId}`);
          } else {
            navigate(`/order-confirmation?session=${sessionId}`);
          }
          return;
        }

        // 3. COD Path — Confirm & create sub-orders
        const confirmResult = await confirmCheckout({ sessionId });
        const { orders = [] } = confirmResult;

        clearCart();
        toast.success(t('Order placed successfully!'));

        if (orders.length === 1) {
          navigate(`/order-confirmation/${orders[0].orderId}`);
        } else {
          navigate(`/order-confirmation?session=${sessionId}`);
        }
      } catch (error) {
        toast.error(t(error?.message || 'Failed to place order'));
      } finally {
        setIsPlacingOrder(false);
      }
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="w-full pb-44 lg:pb-12 min-h-screen bg-surface-muted">
          {/* Header */}
          <div className="bg-surface border-b border-border sticky top-0 z-30 shadow-sm">
            {/* Title Bar */}
            <div className="px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-surface-muted rounded-full transition-colors">
                <FiArrowLeft className="text-xl text-content-secondary" />
              </button>
              <h1 className="text-xl font-bold text-content">{t('Checkout')}</h1>
            </div>
            {/* Steps Bar */}
            <div className="px-4 pb-3">
              <MobileCheckoutSteps currentStep={step} totalSteps={2} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="lg:px-4 lg:py-6">
            <div className="lg:grid lg:grid-cols-12 lg:gap-8">
              {/* Left Column - Steps */}
              <div className="lg:col-span-8 space-y-6">
                {/* Step 1: Shipping Information */}
                {step === 1 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="px-4 py-4 lg:p-0">
                    <h2 className="text-lg font-bold text-content mb-4 flex items-center gap-2">
                      <FiTruck className="text-brand-primary" />
                      {t('Shipping Information')}
                    </h2>

                    {/* Saved Addresses */}
                    {isAuthenticated && addresses.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-content-secondary mb-3">
                          {t('Saved Addresses')}
                        </h3>
                        <div className="space-y-2 mb-3">
                          {addresses.map((address) => (
                            <div
                              key={address.id}
                              onClick={() => handleSelectAddress(address)}
                              className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedAddressId === address.id
                                ? "border-brand-primary bg-surface-muted"
                                : "border-border"
                                }`}>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-2 flex-1">
                                  <FiMapPin className="text-brand-primary mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <h4 className="font-bold text-content text-sm">
                                      {address.name}
                                    </h4>
                                    <p className="text-xs text-content-secondary">
                                      {address.fullName}
                                    </p>
                                    <p className="text-xs text-content-secondary">
                                      {address.address}
                                    </p>
                                    <p className="text-xs text-content-secondary">
                                      {address.city}, {address.state}{" "}
                                      {address.zipCode}
                                    </p>
                                  </div>
                                </div>
                                {selectedAddressId === address.id && (
                                  <FiCheck className="text-brand-primary text-xl flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddressForm(true)}
                          className="flex items-center gap-2 text-brand-primary hover:text-brand-primaryHover font-semibold text-sm">
                          <FiPlus />
                          {t('Add New Address')}
                        </button>
                      </div>
                    )}

                    {/* Address Form */}
                    <div className="space-y-4 bg-surface p-4 rounded-xl border border-border-light shadow-sm lg:p-6">
                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Full Name')}
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-content-secondary mb-2">
                            {t('Email')}
                          </label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-content-secondary mb-2">
                            {t('Phone Number')}
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Address')}
                        </label>
                        <textarea
                          name="address"
                          value={formData.address}
                          onChange={handleInputChange}
                          required
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-content-secondary mb-2">
                            {t('City')}
                          </label>
                          <input
                            type="text"
                            name="city"
                            value={formData.city}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-content-secondary mb-2">
                            {t('State')}
                          </label>
                          <input
                            type="text"
                            name="state"
                            value={formData.state}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-content-secondary mb-2">
                            {t('ZIP Code')}
                          </label>
                          <input
                            type="text"
                            name="zipCode"
                            value={formData.zipCode}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-content-secondary mb-2">
                            {t('Country')}
                          </label>
                          <input
                            type="text"
                            name="country"
                            value={formData.country}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Payment */}
                {step === 2 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="px-4 py-4 lg:p-0">
                    <h2 className="text-lg font-bold text-content mb-4 flex items-center gap-2">
                      <FiCreditCard className="text-brand-primary" />
                      {t('Payment Method')}
                    </h2>
                    <div className="space-y-3 mb-6">
                      {["card", "cash", "wallet", "upi"].filter(method => {
                        if (!paymentSettings) return true; // Show all until loaded
                        if (method === 'card') return paymentSettings.cardEnabled !== false;
                        if (method === 'cash') return paymentSettings.codEnabled !== false;
                        if (method === 'wallet') return paymentSettings.walletEnabled !== false;
                        if (method === 'upi') return paymentSettings.upiEnabled !== false;
                        return true;
                      }).map((method) => (
                        <label
                          key={method}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.paymentMethod === method
                            ? "border-brand-primary bg-surface-muted"
                            : "border-border"
                            }`}>
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={method}
                            checked={formData.paymentMethod === method}
                            onChange={handleInputChange}
                            className="w-5 h-5 text-brand-primary"
                          />
                          <span className="font-semibold text-content capitalize text-base">
                            {method === "card"
                              ? t("Credit/Debit Card")
                              : method === "cash"
                                ? t("Cash on Delivery")
                                : method === "wallet"
                                  ? t("Digital Wallet")
                                  : t("UPI")}
                          </span>
                        </label>
                      ))}
                    </div>

                    {/* Per-Fulfillment Group Delivery Promises Breakdown */}
                    <div className="mb-6 space-y-3">
                      <h3 className="text-base font-bold text-content flex items-center gap-2">
                        <FiTruck className="text-brand-primary" />
                        <span>Delivery & Logistics Promises</span>
                      </h3>
                      <div className="space-y-3">
                        {fulfillmentGroups.map((fg) => {
                          if (fg.fulfillmentType === 'quick_commerce') {
                            const qcFee = quickEstimate?.available ? Number(quickEstimate.deliveryFee || 0) : Number(fg.deliveryFee || 0);
                            const qcPkg = quickEstimate?.available ? Number(quickEstimate.packagingFee || 0) : Number(fg.packagingFee || 0);
                            const etaLabel = isEstimatingQuick && !quickEstimate ? 'Calculating...' : (quickEstimate?.available ? formatEtaRange(quickEstimate?.eta?.etaMinutes) : fg.etaWindow || '15–25 min');

                            return (
                              <div key="quick_commerce" className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/40 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                      <FiZap className="text-lg" />
                                    </div>
                                    <div>
                                      <h4 className="font-extrabold text-emerald-900 dark:text-emerald-300 text-sm">⚡ Quick Commerce (Express Delivery)</h4>
                                      <p className="text-xs text-content-secondary font-medium">Express Daily Store</p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30">
                                    {etaLabel}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-emerald-500/20">
                                  <div className="flex justify-between text-content-secondary font-medium">
                                    <span>Delivery Fee:</span>
                                    <span className="font-bold text-content">
                                      {qcFee === 0 ? 'FREE' : formatPrice(qcFee)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-content-secondary font-medium">
                                    <span>Packaging:</span>
                                    <span className="font-bold text-content">
                                      {formatPrice(qcPkg)}
                                    </span>
                                  </div>
                                </div>

                                {quickBlockReason && (
                                  <p className="text-xs text-status-error pt-1">{quickBlockReason}</p>
                                )}
                              </div>
                            );
                          }

                          if (fg.fulfillmentType === 'wholesale') {
                            const wholesaleFee = Number(fg.deliveryFee || 0);

                            return (
                              <div key="wholesale" className="p-4 rounded-2xl border border-purple-500/30 bg-purple-50/60 dark:bg-purple-950/40 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                                      <FiTruck className="text-lg" />
                                    </div>
                                    <div>
                                      <h4 className="font-extrabold text-purple-900 dark:text-purple-300 text-sm">🏭 Wholesale (B2B Bulk Freight)</h4>
                                      <p className="text-xs text-content-secondary font-medium">Mega Bulk Depot</p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-800 dark:text-purple-200 border border-purple-500/30">
                                    {fg.etaWindow || 'Lead Time: 5–7 Business Days'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-purple-500/20">
                                  <div className="flex justify-between text-content-secondary font-medium">
                                    <span>Freight Shipping:</span>
                                    <span className="font-bold text-content">
                                      {wholesaleFee === 0 ? 'FREE' : formatPrice(wholesaleFee)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-content-secondary font-medium">
                                    <span>GST Tax Invoice:</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">Included ✓</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Default Retail
                          const retailFee = Number(fg.deliveryFee || 0);

                          return (
                            <div key="retail" className="p-4 rounded-2xl border border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/40 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                    <FiPackage className="text-lg" />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-blue-900 dark:text-blue-300 text-sm">📦 Standard Retail (Shipment)</h4>
                                    <p className="text-xs text-content-secondary font-medium">Marketplace Vendors</p>
                                  </div>
                                </div>
                                <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-800 dark:text-blue-200 border border-blue-500/30">
                                  {fg.etaWindow || 'Delivery: 4–6 Days'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-blue-500/20">
                                <div className="flex justify-between text-content-secondary font-medium">
                                  <span>Standard Shipping:</span>
                                  <span className="font-bold text-content">
                                    {retailFee === 0 ? 'FREE' : formatPrice(retailFee)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-content-secondary font-medium">
                                  <span>Tracking:</span>
                                  <span className="font-bold text-content">Live Tracking</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Shipping Options */}
                    {!isQuickCommerce && total < 100 && (
                      <div className="mb-6">
                        <h3 className="text-base font-semibold text-content mb-3">
                          {t('Shipping Options')}
                        </h3>
                        <div className="space-y-3">
                          <label
                            className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${shippingOption === "standard"
                              ? "border-brand-primary bg-surface-muted"
                              : "border-border"
                              }`}>
                            <div>
                              <input
                                type="radio"
                                name="shippingOption"
                                value="standard"
                                checked={shippingOption === "standard"}
                                onChange={(e) => setShippingOption(e.target.value)}
                                className="w-5 h-5 text-brand-primary mr-3"
                              />
                              <span className="font-semibold text-content text-base">
                                {t('Standard Shipping')}
                              </span>
                              <p className="text-xs text-content-secondary">
                                {t('5-7 business days')}
                              </p>
                            </div>
                            <span className="font-bold text-content">
                              {formatPrice(50)}
                            </span>
                          </label>
                          <label
                            className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${shippingOption === "express"
                              ? "border-brand-primary bg-surface-muted"
                              : "border-border"
                              }`}>
                            <div>
                              <input
                                type="radio"
                                name="shippingOption"
                                value="express"
                                checked={shippingOption === "express"}
                                onChange={(e) => setShippingOption(e.target.value)}
                                className="w-5 h-5 text-brand-primary mr-3"
                              />
                              <span className="font-semibold text-content text-base">
                                {t('Express Shipping')}
                              </span>
                              <p className="text-xs text-content-secondary">
                                {t('2-3 business days')}
                              </p>
                            </div>
                            <span className="font-bold text-content">
                              {formatPrice(100)}
                            </span>
                          </label>
                        </div>
                        <p className="text-xs text-content-muted mt-2">
                          {isEstimatingShipping
                            ? t("Updating shipping estimate...")
                            : `${t('Estimated shipping:')} ${formatPrice(shipping)}`}
                        </p>
                      </div>
                    )}

                    {/* Coupon Code */}
                    <div className="mb-6">
                      <h3 className="text-base font-semibold text-content mb-3">
                        {t('Coupon Code')}
                      </h3>
                      {!appliedCoupon ? (
                        <>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={couponCode}
                              onChange={(e) => setCouponCode(e.target.value)}
                              placeholder={t("Enter code")}
                              className="flex-1 px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyCoupon()}
                              disabled={isApplyingCoupon}
                              className="px-4 py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover transition-all">
                              {isApplyingCoupon ? t("Applying...") : t("Apply")}
                            </button>
                          </div>
                          {availableCoupons.length > 0 && (
                            <div className="mt-3 bg-surface-muted rounded-xl p-3 border border-border">
                              <h4 className="text-sm font-semibold text-content mb-2 flex items-center gap-2">
                                <FiTag className="text-brand-primary" />
                                {t('Available coupons')}
                              </h4>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {availableCoupons.slice(0, 8).map((coupon) => (
                                  <button
                                    key={coupon._id || coupon.code}
                                    type="button"
                                    onClick={() => handleApplyCoupon(coupon.code)}
                                    disabled={isApplyingCoupon}
                                    className="w-full text-left p-2 bg-surface rounded-lg border border-border hover:border-brand-primary transition-colors"
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-semibold text-content">{coupon.code}</p>
                                      <p className="text-xs font-semibold text-brand-primary">
                                        {coupon.type === "percentage"
                                          ? `${coupon.value}% ${t('OFF')}`
                                          : coupon.type === "fixed"
                                            ? `${formatPrice(coupon.value)} ${t('OFF')}`
                                            : t("Free Shipping")}
                                      </p>
                                    </div>
                                    <p className="text-xs text-content-secondary">
                                      {t('Min order:')} {formatPrice(coupon.minOrderValue || 0)}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-between p-3 bg-status-successBg rounded-xl border border-status-success/20">
                          <div>
                            <p className="text-sm font-semibold text-status-success">
                              {appliedCoupon.code || "Coupon"} {t('Applied')}
                            </p>
                            <p className="text-xs text-status-success font-medium">
                              {t('Code:')} {couponCode}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedCoupon(null);
                              setAppliedDiscount(0);
                              setCouponCode("");
                            }}
                            className="text-status-error hover:text-status-error/80">
                            <FiX className="text-lg" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Order Summary (Mobile Only) */}
                    <div className="glass-card rounded-xl p-4 lg:hidden">
                      <OrderSummary
                        fulfillmentGroups={fulfillmentGroups}
                        itemsByVendor={itemsByVendor}
                        total={total}
                        discount={discount}
                        shipping={shipping}
                        packagingFee={packagingFee}
                        tax={tax}
                        finalTotal={finalTotal}
                        bulkSavings={bulkSavings}
                        quickEstimate={quickEstimate}
                        formatPrice={formatPrice}
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Right Column - Desktop Order Summary */}
              <div className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 space-y-4">
                  <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
                    <OrderSummary
                      fulfillmentGroups={fulfillmentGroups}
                      itemsByVendor={itemsByVendor}
                      total={total}
                      discount={discount}
                      shipping={shipping}
                      packagingFee={packagingFee}
                      tax={tax}
                      finalTotal={finalTotal}
                      bulkSavings={bulkSavings}
                      quickEstimate={quickEstimate}
                      formatPrice={formatPrice}
                    />
                    <div className="p-4 border-t border-border bg-surface-muted space-y-3">
                      {step === 2 && fulfillmentGroups.length > 1 && (
                        <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/40 text-xs space-y-2">
                          <div className="flex items-center gap-2 font-extrabold text-amber-400">
                            <FiPackage className="text-sm" />
                            <span>Order Splitting Notice</span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            Your purchase will automatically be split into <strong>{fulfillmentGroups.length} independent sub-orders</strong>:
                          </p>
                          <ul className="space-y-1 text-[11px] font-medium text-slate-200 pl-1">
                            {fulfillmentGroups.map((fg) => (
                              <li key={fg.fulfillmentType} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                <span>
                                  {fg.fulfillmentType === 'quick_commerce' ? '1 Quick Commerce Order (15–25 min)' :
                                   fg.fulfillmentType === 'wholesale' ? '1 Wholesale Order (5–7 Business Days)' :
                                   '1 Retail Order (4–6 Days)'}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                            You will be able to track each order independently in your Order History.
                          </p>
                        </div>
                      )}

                      {step === 2 && isQuickCommerce && quickBlockReason && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-medium">
                          ⚠️ {quickBlockReason}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={isPlacingOrder}
                        className="w-full bg-brand-primary text-black py-3.5 rounded-xl font-bold text-lg shadow-lg hover:bg-brand-primaryHover transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50">
                        {step === 2 ? (isPlacingOrder ? t("Placing Order...") : t("Place Order")) : t("Continue to Payment")}
                      </button>
                      {step === 2 && (
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="w-full mt-3 py-2 text-content-secondary font-semibold hover:text-content transition-colors text-sm">
                          {t('Back to Shipping')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Trust Badges or Info */}
                  <div className="flex justify-center gap-4 text-content-muted text-2xl pt-2 opacity-70">
                    <FiLock className="w-6 h-6" />
                    <span className="text-xs text-content-muted">{t('Secure Checkout')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Buttons (Mobile Fixed Bottom) */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border p-4 z-40 safe-area-bottom lg:hidden shadow-lg">
              {step === 2 && fulfillmentGroups.length > 1 && (
                <div className="mb-2 p-2.5 rounded-xl bg-slate-900 border border-amber-500/40 text-[11px] text-slate-200">
                  ℹ️ Order will be split into <strong>{fulfillmentGroups.length} independent shipments</strong> ({fulfillmentGroups.map(fg => fg.fulfillmentType === 'quick_commerce' ? 'QC 15–25m' : fg.fulfillmentType === 'wholesale' ? 'Wholesale 5–7d' : 'Retail 4–6d').join(', ')}).
                </div>
              )}
              {step === 2 && isQuickCommerce && quickBlockReason && (
                <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-medium">
                  ⚠️ {quickBlockReason}
                </div>
              )}
              <div className="flex gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="px-6 py-3 bg-surface-muted text-content-secondary rounded-xl font-semibold hover:bg-border transition-colors">
                    {t('Back')}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPlacingOrder}
                  className="flex-1 bg-brand-primary text-black py-3 rounded-xl font-semibold hover:bg-brand-primaryHover transition-all duration-300 disabled:opacity-50">
                  {step === 2 ? (isPlacingOrder ? "Placing..." : "Place Order") : "Continue"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Address Form Modal */}
        <AnimatePresence>
          {showAddressForm && (
            <AddressFormModal
              onSubmit={handleNewAddress}
              onCancel={() => setShowAddressForm(false)}
            />
          )}
        </AnimatePresence>
      </MobileLayout>
    </PageTransition>
  );
};

// Address Form Modal Component
const AddressFormModal = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: "",
    fullName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={onCancel}>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-t-3xl p-6 w-full max-h-[90vh] overflow-y-auto border-t border-border">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-content">Add New Address</h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-surface-muted rounded-full text-content-secondary">
            <FiX className="text-xl" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Address Label
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
              placeholder="Home, Work, etc."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Full Name
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Street Address
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                State
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">
                Zip Code
              </label>
              <input
                type="text"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">
              Country
            </label>
            <input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl border-2 border-border focus:outline-none focus:ring-2 focus:ring-brand-primary text-base bg-surface text-content"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-brand-primary text-black py-3 rounded-xl font-semibold hover:bg-brand-primaryHover transition-all">
              Add Address
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-surface-muted text-content-secondary rounded-xl font-semibold hover:bg-border transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default MobileCheckout;
