import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle } from 'react-icons/fi';
import SubscriptionExpiredOverlay from './SubscriptionExpiredOverlay';
import api from '../../../shared/utils/api';

const VendorActionRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    api.get('/vendor/subscription')
      .then((res) => {
        if (!isMounted) return;
        const data = res?.data;
        if (!data?.hasSubscription || !data?.isActive) {
          setIsExpired(true);
        } else {
          setIsExpired(false);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsExpired(true);
      })
      .finally(() => {
        if (isMounted) setChecking(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#ffc101] border-t-transparent" />
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-amber-200 text-center max-w-lg w-full">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-sm">
            <FiAlertTriangle className="text-3xl" />
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">Subscription Expired</h2>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            Your vendor subscription has ended. You cannot add or edit products while in View-Only mode. Please subscribe to a plan to continue managing your catalog.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/vendor/subscription')}
              className="w-full py-3 bg-[#ffc101] text-black font-extrabold rounded-xl shadow-md hover:bg-[#e6ac00] transition-all text-sm"
            >
              View Subscription Plans &amp; Resubscribe
            </button>

            <button
              onClick={() => navigate('/vendor/dashboard')}
              className="w-full py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <SubscriptionExpiredOverlay
          isOpen={true}
          message="Your subscription has expired. Please choose a plan to create or edit products."
        />
      </div>
    );
  }

  return children;
};

export default VendorActionRoute;
