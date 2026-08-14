import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiBriefcase, FiArrowRight } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from "../store/vendorAuthStore";
import toast from 'react-hot-toast';
import { loginLogo } from '../../../shared/utils/imagePaths';

const VendorLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useVendorAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const vendor = useVendorAuthStore.getState().vendor;
      const readableWorkspaces = vendor?.readableWorkspaces || vendor?.activeWorkspaces || [];
      const from = location.state?.from?.pathname;
      if (from && from !== '/vendor/dashboard' && from !== '/vendor') {
        navigate(from, { replace: true });
      } else if (readableWorkspaces.length > 1 && !sessionStorage.getItem('vendor-last-workspace')) {
        navigate('/vendor/workspaces', { replace: true });
      } else {
        const lastWorkspace = sessionStorage.getItem('vendor-last-workspace') || readableWorkspaces[0];
        navigate(lastWorkspace ? `/vendor/dashboard?workspace=${lastWorkspace}` : '/vendor/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, navigate, location]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await login(formData.email, formData.password, rememberMe);
      toast.success('Login successful!');
      sessionStorage.removeItem('vendor-last-workspace');
      const vendor = useVendorAuthStore.getState().vendor;
      const readableWorkspaces = vendor?.readableWorkspaces || vendor?.activeWorkspaces || [];
      const from = location.state?.from?.pathname;
      if (from && from !== '/vendor/dashboard' && from !== '/vendor') {
        navigate(from, { replace: true });
      } else if (readableWorkspaces.length > 1) {
        navigate('/vendor/workspaces', { replace: true });
      } else if (readableWorkspaces.length === 1) {
        navigate(`/vendor/dashboard?workspace=${readableWorkspaces[0]}`, { replace: true });
      } else {
        navigate('/vendor/dashboard', { replace: true });
      }
    } catch (error) {
      const email = formData.email.trim().toLowerCase();
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Invalid credentials';

      if (message.includes('Please verify your email first')) {
        toast.error(message);
        navigate('/vendor/verification', {
          replace: true,
          state: {
            email,
            returnTo: '/vendor/register',
          },
        });
        return;
      }

      if (message.includes('Please complete your vendor onboarding by choosing a subscription plan')) {
        toast.error(message);
        navigate('/vendor/register', {
          replace: true,
          state: {
            resumeEmail: email,
          },
        });
        return;
      }

      if (message.includes('Please complete your vendor onboarding for your selected plan')) {
        toast.error(message);
        navigate('/vendor/register', {
          replace: true,
          state: {
            resumeEmail: email,
          },
        });
        return;
      }

      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Ambient Glows & Mesh Grid */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[450px] h-[450px] bg-slate-800/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-25 pointer-events-none" />

      {/* Main Vendor Card */}
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
              <FiBriefcase className="text-xs" />
              <span>Vendor Portal</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">
              Vendor Portal Login
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              Enter your credentials to access your seller dashboard & manage products
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="vendor@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all font-medium text-sm hover:border-slate-600"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="w-full pl-11 pr-11 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all font-medium text-sm hover:border-slate-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors p-1"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/30 focus:ring-offset-slate-900 cursor-pointer accent-amber-500"
                />
                <span className="text-xs sm:text-sm text-slate-300 group-hover:text-white transition-colors">
                  Remember me
                </span>
              </label>
              <Link
                to="/vendor/forgot-password"
                className="text-xs sm:text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_6px_25px_rgba(212,175,55,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
            >
              {isLoading ? (
                <span>Logging in...</span>
              ) : (
                <>
                  <span>Login to Vendor Dashboard</span>
                  <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </motion.button>

            {/* Register Link */}
            <div className="text-center pt-4 border-t border-slate-800/80 mt-6">
              <p className="text-xs sm:text-sm text-slate-400">
                Don't have a vendor account?{' '}
                <Link
                  to="/vendor/register"
                  className="text-amber-400 hover:text-amber-300 font-bold transition-colors underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400"
                >
                  Register as Vendor
                </Link>
              </p>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default VendorLogin;
