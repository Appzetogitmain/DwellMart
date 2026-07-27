import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useAdminAuthStore } from '../store/adminStore';
import toast from 'react-hot-toast';
import { loginLogo } from '../../../shared/utils/imagePaths';

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = window.atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const resolveAdminRedirectPath = (location) => {
  const fromPath = location?.state?.from?.pathname;
  if (
    typeof fromPath === 'string' &&
    fromPath.startsWith('/admin') &&
    fromPath !== '/admin/login'
  ) {
    return fromPath;
  }
  return '/admin/dashboard';
};

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, logout, isAuthenticated, isLoading, token } = useAdminAuthStore();
  const accessToken = token || localStorage.getItem('adminToken');
  const payload = decodeJwtPayload(accessToken);
  const role = String(payload?.role || '').toLowerCase();
  const tokenExpiryMs =
    typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  const isExpired = tokenExpiryMs ? Date.now() >= tokenExpiryMs : false;
  const hasValidRole = role === 'admin' || role === 'superadmin';
  const hasRoleClaim = Boolean(role);
  const hasValidSession =
    Boolean(accessToken) &&
    !isExpired &&
    (!hasRoleClaim || hasValidRole);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Clear stale persisted auth state that no longer has a valid token session.
  useEffect(() => {
    if (isAuthenticated && !hasValidSession) {
      logout();
    }
  }, [hasValidSession, isAuthenticated, logout]);

  // Redirect only for a valid authenticated session.
  useEffect(() => {
    if (isAuthenticated && hasValidSession) {
      const from = resolveAdminRedirectPath(location);
      navigate(from, { replace: true });
    }
  }, [hasValidSession, isAuthenticated, navigate, location]);

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
      const from = resolveAdminRedirectPath(location);
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error.message || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-8 w-full max-w-md shadow-2xl"
      >
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-950 px-6 py-3.5 rounded-2xl border border-amber-500/30 shadow-xl inline-flex items-center justify-center">
              <img
                src={loginLogo}
                alt="DwellMart Logo"
                className="h-14 sm:h-16 w-auto object-contain drop-shadow-md"
              />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800 mb-2">Admin Login</h1>
          <p className="text-gray-600">Enter your credentials to access the admin panel</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="admin@admin.com"
                className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800 placeholder:text-gray-400"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                className="w-full pl-12 pr-12 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800 placeholder:text-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Remember me</span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Demo Credentials */}
        <div className="mt-6 p-4 bg-primary-50 rounded-xl">
          <p className="text-sm text-gray-700 font-semibold mb-2">Demo Credentials:</p>
          <p className="text-xs text-gray-600">Email: admin@admin.com</p>
          <p className="text-xs text-gray-600">Password: admin123</p>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;

