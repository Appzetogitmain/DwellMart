import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

const SubscriptionExpiredOverlay = ({ isOpen: isOpenProp, onClose: onCloseProp, message: messageProp }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(isOpenProp !== undefined ? isOpenProp : true);
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    if (isOpenProp !== undefined) {
      setIsOpen(isOpenProp);
    }
  }, [isOpenProp]);

  useEffect(() => {
    const handleTrigger = (e) => {
      setCustomMessage(e.detail?.message || '');
      setIsOpen(true);
    };

    window.addEventListener('vendor-subscription-expired', handleTrigger);
    return () => {
      window.removeEventListener('vendor-subscription-expired', handleTrigger);
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (onCloseProp) onCloseProp();
  };

  const handleLogout = () => {
    localStorage.removeItem('vendor-token');
    localStorage.removeItem('vendor-refresh-token');
    localStorage.removeItem('vendor-auth-storage');
    navigate('/vendor/login');
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] bg-gray-900/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center relative border border-gray-100"
        >
          {/* Top Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            title="Dismiss & View Panel"
          >
            <FiX className="text-xl" />
          </button>

          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <FiAlertTriangle className="text-3xl" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Subscription Expired</h2>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            {messageProp || customMessage || 'Your vendor subscription has ended. You are currently in View-Only mode. Please resubscribe to create/edit products or manage orders.'}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/vendor/renew-subscription');
              }}
              className="w-full py-3 bg-[#ffc101] text-black font-extrabold rounded-xl shadow-md hover:bg-[#e6ac00] transition-all text-sm"
            >
              Resubscribe Now
            </button>

            <button
              onClick={handleClose}
              className="w-full py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm"
            >
              Dismiss &amp; View Vendor Panel
            </button>

            <button
              onClick={handleLogout}
              className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 font-medium transition-all"
            >
              Log Out of Store
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SubscriptionExpiredOverlay;
