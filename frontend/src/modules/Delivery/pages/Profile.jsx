import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { FiUser, FiMail, FiPhone, FiTruck, FiEdit2, FiSave, FiX, FiLogOut, FiRefreshCw } from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../shared/utils/helpers';

const DeliveryProfile = () => {
  const navigate = useNavigate();
  const { deliveryBoy, updateProfile, fetchProfile, fetchProfileSummary, isLoading, logout } = useDeliveryAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileMetrics, setProfileMetrics] = useState({
    totalDeliveries: 0,
    completedToday: 0,
    earnings: 0,
  });
  const [formData, setFormData] = useState({
    name: deliveryBoy?.name || '',
    email: deliveryBoy?.email || '',
    phone: deliveryBoy?.phone || '',
    vehicleType: deliveryBoy?.vehicleType || '',
    vehicleNumber: deliveryBoy?.vehicleNumber || '',
  });

  const loadProfile = useCallback(async () => {
    try {
      setLoadFailed(false);
      const profile = await fetchProfile();
      try {
        const summary = await fetchProfileSummary();
        setProfileMetrics({
          totalDeliveries: Number(summary?.totalDeliveries || 0),
          completedToday: Number(summary?.completedToday || 0),
          earnings: Number(summary?.earnings || 0),
        });
      } catch {
        setProfileMetrics({
          totalDeliveries: Number(profile?.totalDeliveries || 0),
          completedToday: 0,
          earnings: 0,
        });
      }
    } catch {
      setLoadFailed(true);
    }
  }, [fetchProfile, fetchProfileSummary]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setFormData({
      name: deliveryBoy?.name || '',
      email: deliveryBoy?.email || '',
      phone: deliveryBoy?.phone || '',
      vehicleType: deliveryBoy?.vehicleType || '',
      vehicleNumber: deliveryBoy?.vehicleNumber || '',
    });
  }, [deliveryBoy]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!formData.phone?.trim()) {
      toast.error('Phone is required');
      return;
    }
    try {
      await updateProfile({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        vehicleType: formData.vehicleType?.trim() || '',
        vehicleNumber: formData.vehicleNumber?.trim() || '',
      });
      setIsEditing(false);
      toast.success('Profile updated successfully');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleCancel = () => {
    setFormData({
      name: deliveryBoy?.name || '',
      email: deliveryBoy?.email || '',
      phone: deliveryBoy?.phone || '',
      vehicleType: deliveryBoy?.vehicleType || '',
      vehicleNumber: deliveryBoy?.vehicleNumber || '',
    });
    setIsEditing(false);
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/delivery/login');
  };

  const stats = [
    { label: 'Total Deliveries', value: Number(profileMetrics.totalDeliveries || 0) },
    { label: 'Completed Today', value: Number(profileMetrics.completedToday || 0) },
    { label: 'Rating', value: Number(deliveryBoy?.rating || 0).toFixed(1) },
    { label: 'Earnings', value: formatPrice(Number(profileMetrics.earnings || 0)) },
  ];

  return (
    <PageTransition>
      <div className="space-y-6 select-none max-w-4xl mx-auto">
        {/* Profile Banner */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl bg-slate-800/90 backdrop-blur-xl border border-amber-500/20 p-6 sm:p-8 shadow-xl overflow-hidden"
        >
          {/* Top Amber Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Agent Profile</h1>
            <div className="flex items-center gap-2">
              {loadFailed && (
                <button
                  onClick={loadProfile}
                  className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-1"
                >
                  <FiRefreshCw /> Retry
                </button>
              )}
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <FiEdit2 /> Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-md hover:from-amber-400 hover:to-amber-500 transition-all"
                  >
                    <FiSave /> Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-bold hover:text-white"
                  >
                    <FiX /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-extrabold text-2xl sm:text-3xl flex items-center justify-center shadow-[0_4px_20px_rgba(212,175,55,0.3)] shrink-0">
              {deliveryBoy?.name?.charAt(0)?.toUpperCase() || 'D'}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white truncate">
                {deliveryBoy?.name || 'Delivery Partner'}
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm truncate">{deliveryBoy?.email || 'email@example.com'}</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold mt-2 uppercase tracking-wider">
                <FiTruck className="text-xs" />
                <span>{deliveryBoy?.vehicleType || 'Partner'}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-4 shadow-lg"
            >
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{stat.label}</p>
              <p className="text-xl sm:text-2xl font-extrabold text-amber-400">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Personal Details */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-4"
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 border-b border-slate-700/80 pb-3 flex items-center gap-2">
            <FiUser className="text-amber-400 text-base" />
            Personal Details
          </h2>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-2">
              <FiUser className="text-amber-400" />
              Full Name
            </label>
            {isEditing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm font-medium">
                {formData.name}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-2">
              <FiMail className="text-amber-400" />
              Email Address
            </label>
            {isEditing ? (
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm font-medium">
                {formData.email}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-2">
              <FiPhone className="text-amber-400" />
              Phone Number
            </label>
            {isEditing ? (
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm font-medium">
                {formData.phone}
              </p>
            )}
          </div>
        </motion.div>

        {/* Vehicle Information */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-4"
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 border-b border-slate-700/80 pb-3 flex items-center gap-2">
            <FiTruck className="text-amber-400 text-base" />
            Vehicle Details
          </h2>

          {/* Vehicle Type */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Vehicle Type
            </label>
            {isEditing ? (
              <select
                name="vehicleType"
                value={formData.vehicleType}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="Bike">Bike</option>
                <option value="Scooter">Scooter</option>
                <option value="Car">Car</option>
                <option value="Van">Van</option>
                <option value="Truck">Truck</option>
              </select>
            ) : (
              <p className="px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm font-medium">
                {formData.vehicleType}
              </p>
            )}
          </div>

          {/* Vehicle Number */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Vehicle Number
            </label>
            {isEditing ? (
              <input
                type="text"
                name="vehicleNumber"
                value={formData.vehicleNumber}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm font-medium">
                {formData.vehicleNumber}
              </p>
            )}
          </div>
        </motion.div>

        {/* Logout Section */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl"
        >
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-2xl font-bold text-sm transition-all"
          >
            <FiLogOut className="text-lg" />
            <span>Logout Account</span>
          </button>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryProfile;
