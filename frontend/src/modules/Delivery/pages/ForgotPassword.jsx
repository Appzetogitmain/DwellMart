import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheck, FiMail, FiRefreshCw, FiTruck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { loginLogo } from '../../../shared/utils/imagePaths';

const OTP_LENGTH = 6;

const DeliveryForgotPassword = () => {
  const navigate = useNavigate();
  const { forgotPassword, verifyResetOtp, isLoading } = useDeliveryAuthStore();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('request');
  const [codes, setCodes] = useState(Array(OTP_LENGTH).fill(''));
  const inputRefs = useRef([]);

  useEffect(() => {
    if (step === 'verify' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email.');
      return;
    }

    try {
      await forgotPassword(email.trim().toLowerCase());
      toast.success('If the email exists, reset OTP has been sent.');
      setStep('verify');
    } catch {
      // Global API interceptor shows toast
    }
  };

  const handleCodeChange = (index, value) => {
    if (value.length > 1 || (value && !/^\d$/.test(value))) return;
    const next = [...codes];
    next[index] = value;
    setCodes(next);
    if (value && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasted)) return;
    setCodes(pasted.split(''));
    inputRefs.current[OTP_LENGTH - 1]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otp = codes.join('');
    if (otp.length !== OTP_LENGTH) {
      toast.error('Please enter the full OTP.');
      return;
    }

    try {
      await verifyResetOtp(email.trim().toLowerCase(), otp);
      toast.success('OTP verified. Please set your new password.');
      navigate(`/delivery/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      // Global API interceptor shows toast
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Ambient Glows & Mesh Grid */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[450px] h-[450px] bg-slate-800/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-25 pointer-events-none" />

      {/* Main Delivery Card */}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <div className="relative rounded-3xl bg-slate-900/90 backdrop-blur-2xl border border-amber-500/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden p-8 sm:p-10">
          {/* Top Gold Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

          {/* Header & Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <div className="bg-slate-950 px-7 py-3.5 rounded-2xl border border-amber-500/30 shadow-[0_0_30px_rgba(212,175,55,0.15)] inline-flex items-center justify-center">
                <img
                  src={loginLogo}
                  alt="DwellMart Logo"
                  className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                />
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <FiTruck className="text-xs" />
              <span>Delivery Portal</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">
              Forgot Password
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              {step === 'request'
                ? 'Enter your delivery account email to receive OTP.'
                : `Enter the OTP sent to ${email}`}
            </p>
          </div>

          {step === 'request' ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="delivery@delivery.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all font-medium text-sm hover:border-slate-600"
                    required
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending OTP...' : 'Send Reset OTP'}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="flex justify-center gap-2">
                {codes.map((code, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={code}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    className="w-11 h-11 text-center text-lg font-bold bg-slate-950 border border-slate-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isLoading}
                  className="text-amber-400 hover:text-amber-300 font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <FiRefreshCw />
                  Resend OTP
                </button>
                <button
                  type="button"
                  onClick={() => setStep('request')}
                  className="text-slate-400 hover:text-slate-200 font-medium"
                >
                  Change Email
                </button>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading || codes.some((c) => !c)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? 'Verifying...' : <><FiCheck /> Verify OTP</>}
              </motion.button>
            </form>
          )}

          <div className="text-center pt-4 border-t border-slate-800/80 mt-6">
            <Link
              to="/delivery/login"
              className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-amber-400 font-medium transition-colors"
            >
              <FiArrowLeft />
              Back to Login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DeliveryForgotPassword;
