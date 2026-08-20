import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiPhone, FiShield, FiTruck, FiArrowRight, FiArrowLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import toast from 'react-hot-toast';
import { loginLogo } from '../../../shared/utils/imagePaths';

/**
 * Delivery partner login — mobile number + WhatsApp OTP.
 *
 * There is no password anywhere in this flow, so there is nothing to remember
 * and nothing to reset. Two steps: request a code, then exchange it for a
 * session.
 */
const DeliveryLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, requestLoginOtp, isAuthenticated, isLoading } = useDeliveryAuthStore();

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Redirect if already authenticated
  useEffect(() => {
    const hasDeliveryToken = Boolean(localStorage.getItem('delivery-token'));
    if (isAuthenticated && hasDeliveryToken) {
      const from = location.state?.from?.pathname || '/delivery/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Countdown to the code's five-minute expiry, held equal to the backend
  // window and the WhatsApp template validity.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const formatCountdown = (total) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

  const isExpired = step === 'otp' && secondsLeft === 0;

  const handleRequestOtp = async (event) => {
    event.preventDefault();
    const trimmed = phone.trim();
    if (trimmed.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid mobile number');
      return;
    }

    try {
      const result = await requestLoginOtp(trimmed);
      setStep('otp');
      setOtp('');
      setSecondsLeft((result?.expiresInMinutes ?? 5) * 60);
      toast.success('If this number is registered, a code has been sent to WhatsApp.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Could not send the code');
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      toast.error('Enter the 6-digit code');
      return;
    }

    try {
      await login(phone.trim(), otp.trim());
      toast.success('Login successful!');
      const from = location.state?.from?.pathname || '/delivery/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Invalid code');
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
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex justify-center mb-5"
            >
              <div className="bg-slate-950 px-7 py-3.5 rounded-2xl border border-amber-500/30 shadow-[0_0_30px_rgba(212,175,55,0.15)] inline-flex items-center justify-center">
                <img
                  src={loginLogo}
                  alt="DwellMart Logo"
                  className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                />
              </div>
            </motion.div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <FiTruck className="text-xs" />
              <span>Delivery Portal</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">
              Delivery Portal Login
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              Sign in with your mobile number &mdash; no password needed
            </p>
          </div>

          {/* Step one: mobile number */}
          {step === 'phone' ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Mobile Number
                </label>
                <div className="relative">
                  <FiPhone className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                  <input
                    type="tel"
                    name="phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all font-medium text-sm hover:border-slate-600"
                    required
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  We will send a verification code to this number on WhatsApp.
                </p>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_6px_25px_rgba(212,175,55,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
              >
                {isLoading ? (
                  <span>Sending code...</span>
                ) : (
                  <>
                    <span>Send WhatsApp Code</span>
                    <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </motion.button>
            </form>
          ) : (
            /* Step two: the code */
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <button
                type="button"
                onClick={() => { setStep('phone'); setOtp(''); }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors"
              >
                <FiArrowLeft className="text-sm" />
                <span>Change number</span>
              </button>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  WhatsApp Code
                </label>
                <div className="relative">
                  <FiShield className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-center tracking-[0.4em] font-bold placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-sm"
                    required
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  Sent to <span className="font-semibold text-amber-400">{phone}</span>
                </p>
                {isExpired ? (
                  <p className="mt-2 text-[11px] font-semibold text-red-400">
                    Your code has expired. Please request a new code.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Code expires in{' '}
                    <span className={`font-bold tabular-nums ${secondsLeft <= 60 ? 'text-red-400' : 'text-amber-400'}`}>
                      {formatCountdown(secondsLeft)}
                    </span>
                  </p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={isLoading || isExpired || otp.length !== 6}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_6px_25px_rgba(212,175,55,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
              >
                {isLoading ? (
                  <span>Verifying...</span>
                ) : (
                  <>
                    <span>Login to Delivery Dashboard</span>
                    <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </motion.button>

              {/* Resend is always user-initiated — never automatic. */}
              <p className="text-center text-xs text-slate-400">
                Did not receive the code?{' '}
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isLoading}
                  className="text-amber-400 hover:text-amber-300 font-bold underline underline-offset-4 decoration-amber-500/40 disabled:opacity-50"
                >
                  Resend
                </button>
              </p>
            </form>
          )}

          {/* Register Link */}
          <div className="text-center pt-4 border-t border-slate-800/80 mt-6">
            <p className="text-xs sm:text-sm text-slate-400">
              New delivery partner?{' '}
              <Link
                to="/delivery/register"
                className="text-amber-400 hover:text-amber-300 font-bold transition-colors underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400"
              >
                Register as Delivery Partner
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DeliveryLogin;
