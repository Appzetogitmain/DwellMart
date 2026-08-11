import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiAlertCircle, FiRefreshCw, FiShoppingBag } from 'react-icons/fi';

import api from '../../../shared/utils/api';
import { useCartStore } from '../../../shared/store/useStore';
import PageTransition from '../../../shared/components/PageTransition';
import { Button, Card } from '../../../shared/components/ui';
import MobileLayout from '../components/Layout/MobileLayout';

const MAX_VERIFICATION_ATTEMPTS = 6;
const VERIFICATION_RETRY_MS = 1500;

// React StrictMode mounts effects twice in development. Sharing an in-flight
// request avoids asking the backend to finalise the same paid session twice.
const verificationRequests = new Map();

const unwrapApiData = (response) => response?.data?.data ?? response?.data ?? response ?? {};

const verifyCheckoutSession = (sessionId) => {
  if (verificationRequests.has(sessionId)) {
    return verificationRequests.get(sessionId);
  }

  const request = api
    .post(
      '/payments/cashfree/verify',
      { checkoutSessionId: sessionId },
      { silent: true }
    )
    .then(unwrapApiData)
    .finally(() => verificationRequests.delete(sessionId));

  verificationRequests.set(sessionId, request);
  return request;
};

const wait = (milliseconds) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const getCreatedOrderIds = (verification) => {
  const orders = Array.isArray(verification?.orders) ? verification.orders : [];
  const orderIds = orders
    .map((order) => order?.orderId || order?.id || order?._id)
    .filter(Boolean)
    .map(String);

  if (orderIds.length > 0) return [...new Set(orderIds)];

  const sessionOrderIds = verification?.checkoutSession?.orderIds;
  return Array.isArray(sessionOrderIds)
    ? [...new Set(sessionOrderIds.filter(Boolean).map(String))]
    : [];
};

const PaymentReturn = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clearCart = useCartStore((state) => state.clearCart);
  const sessionId = searchParams.get('session_id') || searchParams.get('session');

  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Confirming your payment securely...');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    const verifyAndContinue = async () => {
      if (!sessionId) {
        setStatus('failed');
        setMessage('The payment return link is missing its checkout session.');
        return;
      }

      setStatus('verifying');
      setMessage('Confirming your payment securely...');

      for (let attempt = 1; attempt <= MAX_VERIFICATION_ATTEMPTS; attempt += 1) {
        try {
          const verification = await verifyCheckoutSession(sessionId);
          if (!active) return;

          if (verification?.isPaid) {
            const orderIds = getCreatedOrderIds(verification);

            // A webhook may have claimed the paid session and still be creating
            // its orders. Wait for real IDs instead of using a CheckoutSession ID.
            if (orderIds.length > 0) {
              clearCart();
              if (orderIds.length === 1) {
                navigate(`/order-confirmation/${encodeURIComponent(orderIds[0])}`, { replace: true });
              } else {
                navigate(`/order-confirmation?session=${encodeURIComponent(sessionId)}`, { replace: true });
              }
              return;
            }

            setMessage('Payment received. We are preparing your order...');
          } else if (!verification?.isPending) {
            setStatus('failed');
            setMessage('The payment was cancelled or could not be completed. No order was placed.');
            return;
          } else {
            setMessage('Payment is still being confirmed. Please keep this page open...');
          }
        } catch {
          if (!active) return;
          setMessage('We are having trouble confirming the payment. Retrying...');
        }

        if (attempt < MAX_VERIFICATION_ATTEMPTS) {
          await wait(VERIFICATION_RETRY_MS);
          if (!active) return;
        }
      }

      if (active) {
        setStatus('pending');
        setMessage('Your payment confirmation is taking longer than usual. Do not pay again until you check the status.');
      }
    };

    verifyAndContinue();
    return () => { active = false; };
  }, [sessionId, retryKey, clearCart, navigate]);

  const isChecking = status === 'verifying';

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="min-h-[75vh] flex items-center justify-center bg-surface-background px-4 py-10">
          <Card variant="default" padding="lg" className="w-full max-w-md text-center">
            {isChecking ? (
              <div className="mx-auto mb-5 h-14 w-14 rounded-full border-4 border-brand-primary/25 border-t-brand-primary animate-spin" />
            ) : (
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <FiAlertCircle size={28} />
              </div>
            )}

            <h1 className="text-xl font-black text-textColor-primary">
              {isChecking ? 'Confirming Payment' : status === 'pending' ? 'Confirmation Pending' : 'Payment Not Completed'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-textColor-muted">{message}</p>

            {!isChecking && (
              <div className="mt-6 space-y-3">
                {status === 'pending' && (
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    leftIcon={<FiRefreshCw />}
                    onClick={() => setRetryKey((value) => value + 1)}
                  >
                    Check Again
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  fullWidth
                  leftIcon={<FiShoppingBag />}
                  onClick={() => navigate('/orders', { replace: true })}
                >
                  View My Orders
                </Button>
                {status === 'failed' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    fullWidth
                    onClick={() => navigate('/checkout', { replace: true })}
                  >
                    Return to Checkout
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default PaymentReturn;
