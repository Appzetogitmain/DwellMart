import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiUser,
  FiPhone,
  FiTruck,
  FiMapPin,
  FiNavigation,
  FiFileText,
  FiArrowRight,
  FiArrowLeft,
  FiInfo,
  FiCheck,
  FiRefreshCw,
  FiEdit2,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { loginLogo } from '../../../shared/utils/imagePaths';
import { reverseGeocode } from '../../../shared/maps/googleMaps';

const VEHICLE_TYPES = ['Bike', 'Scooter', 'EV Scooter', 'Other'];

const DeliveryRegister = () => {
  const navigate = useNavigate();
  const { register, requestRegistrationOtp, verifyRegistrationOtp, isLoading } = useDeliveryAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    latitude: null,
    longitude: null,
    vehicleType: 'Bike',
    aadharCard: null,
  });

  // Mobile Verification State
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Geolocation State
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const cleanPhoneDigits = (val) => String(val || '').replace(/\D/g, '');

  const handleRequestOtp = async () => {
    const rawPhone = formData.phone?.trim();
    const digits = cleanPhoneDigits(rawPhone);

    if (!rawPhone || digits.length < 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsSendingOtp(true);
    try {
      await requestRegistrationOtp(rawPhone);
      setShowOtpInput(true);
      toast.success('Verification code sent to your WhatsApp');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Could not send verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otp = phoneOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      await verifyRegistrationOtp(formData.phone.trim(), otp);
      setIsPhoneVerified(true);
      setShowOtpInput(false);
      setPhoneOtp('');
      toast.success('Mobile number verified successfully!');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Invalid verification code');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResetPhoneVerification = () => {
    setIsPhoneVerified(false);
    setShowOtpInput(false);
    setPhoneOtp('');
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));

        try {
          const geoData = await reverseGeocode({ latitude: lat, longitude: lng });
          const readableAddress = geoData.formattedAddress || geoData.address || `${lat}, ${lng}`;

          setFormData((prev) => ({
            ...prev,
            address: readableAddress,
            latitude: lat,
            longitude: lng,
          }));
          toast.success('Current location and address detected!');
        } catch {
          setFormData((prev) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            address: prev.address || `Lat: ${lat}, Lng: ${lng}`,
          }));
          toast.success('Location coordinates detected!');
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        setIsDetectingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Location access was denied. Please allow location permissions or enter address manually.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          toast.error('Location information is unavailable. Please enter address manually.');
        } else if (error.code === error.TIMEOUT) {
          toast.error('Location request timed out. Please try again or enter address manually.');
        } else {
          toast.error('Could not retrieve current location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;

    if (name === 'phone') {
      if (isPhoneVerified) return;
      setFormData((prev) => ({ ...prev, phone: value }));
      return;
    }

    if (name === 'aadharCard') {
      setFormData((prev) => ({ ...prev, aadharCard: files?.[0] || null }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Full Name is required');
      return;
    }
    if (!formData.phone?.trim()) {
      toast.error('Mobile number is required');
      return;
    }
    if (!isPhoneVerified) {
      toast.error('Please verify your mobile number with OTP first');
      return;
    }
    if (!formData.address?.trim()) {
      toast.error('Address / Location is required');
      return;
    }
    if (!formData.vehicleType) {
      toast.error('Vehicle Type is required');
      return;
    }
    if (!formData.aadharCard) {
      toast.error('Aadhaar Card document upload is required');
      return;
    }

    try {
      const result = await register({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        vehicleType: formData.vehicleType,
        aadharCard: formData.aadharCard,
      });

      toast.success(result.message || 'Registration submitted successfully!');
      navigate('/delivery/login', { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#221300] via-[#3a2403] to-[#1a1204] px-4 py-10 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] bg-amber-500/10 rounded-full blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-[480px] h-[480px] bg-amber-900/20 rounded-full blur-[130px]" />

      <div className="mx-auto max-w-2xl relative z-10">
        {/* Back Link */}
        <Link
          to="/delivery/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          <FiArrowLeft />
          Back to Login
        </Link>

        {/* Page Header */}
        <div className="mb-8">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-4 mb-5"
          >
            <div className="bg-black/40 px-5 py-2.5 rounded-2xl border border-amber-500/20 shadow-[0_0_24px_rgba(212,175,55,0.1)] inline-flex items-center justify-center">
              <img
                src={loginLogo}
                alt="Dwell Mart Logo"
                className="h-9 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <FiTruck className="text-xs" />
              <span>DELIVERY PARTNER ONBOARDING</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-3xl font-extrabold text-white md:text-4xl"
          >
            Join as Delivery Partner
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-2 text-sm text-white/60 max-w-lg"
          >
            Fill in your details, upload your documents, and start delivering once your account is approved by our team.
          </motion.p>
        </div>

        {/* Registration Form Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="rounded-[28px] border border-white/10 bg-white/95 p-6 text-gray-900 shadow-2xl md:p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-7">
            {/* ── Personal Information ── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <FiUser className="text-amber-600" />
                Personal Information
              </h2>

              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="John Doe"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Mobile Number & Integrated OTP Verification */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-600">
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    {isPhoneVerified && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <FiCheck className="stroke-[3]" /> Mobile Verified
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2.5">
                    <div className="relative flex-1">
                      <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        readOnly={isPhoneVerified}
                        required
                        placeholder="+91 98765 43210"
                        className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm transition-all font-medium ${
                          isPhoneVerified
                            ? 'border-emerald-400 bg-emerald-50/80 text-emerald-950 font-bold'
                            : 'border-gray-200 bg-gray-50 text-gray-800 focus:border-[#ffc101] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20'
                        }`}
                      />
                    </div>

                    {!isPhoneVerified ? (
                      <button
                        type="button"
                        onClick={handleRequestOtp}
                        disabled={isSendingOtp || cleanPhoneDigits(formData.phone).length < 10}
                        className="px-5 py-3 rounded-xl bg-[#ffc101] hover:bg-[#ffd042] text-black font-extrabold text-xs shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                      >
                        {isSendingOtp ? (
                          <span className="inline-flex items-center gap-1.5">
                            <FiRefreshCw className="animate-spin text-xs" /> Sending...
                          </span>
                        ) : showOtpInput ? (
                          'Resend OTP'
                        ) : (
                          'Send OTP'
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResetPhoneVerification}
                        title="Change mobile number"
                        className="px-3.5 py-3 rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-semibold text-xs shrink-0 transition-colors inline-flex items-center gap-1.5"
                      >
                        <FiEdit2 className="text-xs" />
                        <span>Change</span>
                      </button>
                    )}
                  </div>

                  {/* Inline OTP Input Box */}
                  <AnimatePresence>
                    {showOtpInput && !isPhoneVerified && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5"
                      >
                        <p className="text-xs font-semibold text-amber-900">
                          Enter 6-digit WhatsApp verification code sent to <strong>{formData.phone}</strong>:
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={phoneOtp}
                            onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="• • • • • •"
                            className="flex-1 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-center text-base font-bold tracking-[0.3em] text-gray-900 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={isVerifyingOtp || phoneOtp.length !== 6}
                            className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs disabled:opacity-40 transition-all shadow-xs"
                          >
                            {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Address / Location + Use Current Location */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-600">
                      Address / Location <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isDetectingLocation}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      <FiNavigation className={`text-xs ${isDetectingLocation ? 'animate-spin text-amber-600' : ''}`} />
                      <span>{isDetectingLocation ? 'Detecting GPS...' : 'Use Current Location'}</span>
                    </button>
                  </div>

                  <div className="relative">
                    <FiMapPin className="absolute left-3.5 top-3.5 text-gray-400 text-base" />
                    <textarea
                      name="address"
                      rows={2}
                      value={formData.address}
                      onChange={handleChange}
                      required
                      placeholder="Enter your street address, area, city, and pincode..."
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all font-medium resize-none"
                    />
                  </div>

                  {formData.latitude && formData.longitude && (
                    <p className="mt-1.5 text-xs font-medium text-emerald-600 flex items-center gap-1">
                      <FiCheck className="text-xs stroke-[3]" />
                      <span>Exact GPS Coordinates Saved ({formData.latitude.toFixed(4)}, {formData.longitude.toFixed(4)})</span>
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* ── Vehicle Information ── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <FiTruck className="text-amber-600" />
                Vehicle Information
              </h2>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-600">
                  Vehicle Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="vehicleType"
                  value={formData.vehicleType}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm text-gray-800 font-semibold focus:border-[#ffc101] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                >
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* ── Document Upload ── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <FiFileText className="text-amber-600" />
                Document Upload
              </h2>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-600">
                  Aadhaar Card <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="file"
                    name="aadharCard"
                    onChange={handleChange}
                    accept=".pdf,image/*"
                    required
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm text-gray-800 file:mr-3 file:rounded-lg file:border-0 file:bg-[#ffc101]/20 file:px-3 file:py-1 file:text-xs file:font-bold file:text-amber-800 hover:file:bg-[#ffc101]/30 transition-all cursor-pointer"
                  />
                </div>
                {formData.aadharCard && (
                  <p className="mt-1.5 text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <FiCheck className="text-xs stroke-[3]" /> {formData.aadharCard.name}
                  </p>
                )}
              </div>
            </section>

            {/* Admin Verification Notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
              <FiInfo className="flex-shrink-0 text-amber-600 mt-0.5 text-base" />
              <p className="text-xs text-amber-800 leading-relaxed font-medium">
                <strong>Note:</strong> Your registration will be submitted for admin verification. You will be able to log in once your account is approved.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !isPhoneVerified}
              className="w-full rounded-2xl bg-[#ffc101] py-3.5 font-bold text-black text-sm sm:text-base hover:bg-[#ffd042] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(255,193,1,0.35)] hover:shadow-[0_6px_28px_rgba(255,193,1,0.5)] transition-all duration-300 flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <span>Registering...</span>
              ) : (
                <>
                  <span>Register as Delivery Partner</span>
                  <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {/* Login Link */}
            <div className="text-center pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Already have an account?{' '}
                <Link
                  to="/delivery/login"
                  className="font-bold text-amber-600 hover:text-amber-700 underline underline-offset-4 decoration-amber-400/50 hover:decoration-amber-600 transition-colors"
                >
                  Login here
                </Link>
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default DeliveryRegister;
