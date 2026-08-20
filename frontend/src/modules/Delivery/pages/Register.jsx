import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiUser, FiPhone, FiTruck, FiMapPin, FiFileText, FiArrowRight, FiArrowLeft, FiInfo, FiShield, FiCheck } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { loginLogo } from '../../../shared/utils/imagePaths';

const VEHICLE_TYPES = ['Bike', 'Scooter', 'Car', 'Van', 'Truck'];

const DeliveryRegister = () => {
  const navigate = useNavigate();
  const { register, requestRegistrationOtp, verifyRegistrationOtp, isLoading } = useDeliveryAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    vehicleType: 'Bike',
    vehicleNumber: '',
    drivingLicense: null,
    aadharCard: null,
  });
  // The mobile number replaces the password entirely: it is proven here and it
  // is the only credential the partner will ever log in with.
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const handleRequestOtp = async () => {
    const phone = formData.phone?.trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid mobile number');
      return;
    }
    setIsSendingOtp(true);
    try {
      await requestRegistrationOtp(phone);
      setShowOtpInput(true);
      toast.success('Verification code sent to your WhatsApp');
    } catch (error) {
      // No email fallback for this code by design — surface the failure.
      toast.error(error?.response?.data?.message || 'Could not send the WhatsApp code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(phoneOtp.trim())) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      await verifyRegistrationOtp(formData.phone.trim(), phoneOtp.trim());
      setIsPhoneVerified(true);
      setShowOtpInput(false);
      toast.success('Mobile number verified');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Invalid verification code');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    // Changing the number after proving it would invalidate the proof.
    if (name === 'phone' && isPhoneVerified) return;
    if (name === 'drivingLicense' || name === 'aadharCard') {
      setFormData((prev) => ({ ...prev, [name]: files?.[0] || null }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!isPhoneVerified) {
      toast.error('Please verify your mobile number first');
      return;
    }
    if (!formData.drivingLicense || !formData.aadharCard) {
      toast.error('Driving License and Aadhar Card are required');
      return;
    }

    try {
      const result = await register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        vehicleType: formData.vehicleType,
        vehicleNumber: formData.vehicleNumber.trim(),
        drivingLicense: formData.drivingLicense,
        aadharCard: formData.aadharCard,
      });
      toast.success(result.message || 'Registration submitted');
      navigate('/delivery/login', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Registration failed');
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
                alt="DwellMart Logo"
                className="h-9 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <FiTruck className="text-xs" />
              <span>Delivery Partner Onboarding</span>
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Full Name */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="John Doe"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="delivery@example.com"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      placeholder="+91 98765 43210"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Area / City
                  </label>
                  <div className="relative">
                    <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="City, State"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Vehicle Information ── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <FiTruck className="text-amber-600" />
                Vehicle Information
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Vehicle Type */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Vehicle Type
                  </label>
                  <select
                    name="vehicleType"
                    value={formData.vehicleType}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm text-gray-800 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                  >
                    {VEHICLE_TYPES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Vehicle Number */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    name="vehicleNumber"
                    value={formData.vehicleNumber}
                    onChange={handleChange}
                    placeholder="MH 01 AB 1234"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 transition-all"
                  />
                </div>
              </div>
            </section>

            {/* ── Document Upload ── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <FiFileText className="text-amber-600" />
                Document Upload
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Driving License */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Driving License <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      name="drivingLicense"
                      onChange={handleChange}
                      accept=".pdf,image/*"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm text-gray-800 file:mr-3 file:rounded-lg file:border-0 file:bg-[#ffc101]/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-amber-700 hover:file:bg-[#ffc101]/20 transition-all"
                    />
                  </div>
                  {formData.drivingLicense && (
                    <p className="mt-1 text-xs text-green-600 font-medium">✓ {formData.drivingLicense.name}</p>
                  )}
                </div>

                {/* Aadhar Card */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Aadhar Card <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      name="aadharCard"
                      onChange={handleChange}
                      accept=".pdf,image/*"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm text-gray-800 file:mr-3 file:rounded-lg file:border-0 file:bg-[#ffc101]/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-amber-700 hover:file:bg-[#ffc101]/20 transition-all"
                    />
                  </div>
                  {formData.aadharCard && (
                    <p className="mt-1 text-xs text-green-600 font-medium">✓ {formData.aadharCard.name}</p>
                  )}
                </div>
              </div>
            </section>

            {/* ── Account Security ── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                <FiShield className="text-amber-600" />
                Verify Your Mobile Number
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                You will sign in with this number and a WhatsApp code. There is no password.
              </p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    readOnly
                    value={formData.phone}
                    placeholder="Enter your mobile number above"
                    className={`w-full rounded-xl border py-3 pl-10 pr-10 text-sm transition-all ${
                      isPhoneVerified
                        ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-900'
                        : 'border-gray-200 bg-gray-50 text-gray-800'
                    }`}
                  />
                  {isPhoneVerified && (
                    <FiCheck className="absolute right-3 top-1/2 -translate-y-1/2 stroke-[3] text-emerald-600" />
                  )}
                </div>
                {!isPhoneVerified && (
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={isSendingOtp || !formData.phone}
                    className="rounded-xl bg-[#ffc101] px-4 py-3 text-xs font-extrabold text-black hover:bg-[#ffd042] disabled:opacity-50"
                  >
                    {isSendingOtp ? 'Sending...' : showOtpInput ? 'Resend' : 'Verify'}
                  </button>
                )}
              </div>

              {showOtpInput && !isPhoneVerified && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit WhatsApp code"
                    className="flex-1 rounded-xl border border-gray-200 bg-amber-50/50 px-4 py-2 text-center text-sm font-bold tracking-widest text-gray-900 focus:border-[#ffc101] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={isVerifyingOtp || phoneOtp.length !== 6}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isVerifyingOtp ? '...' : 'Confirm'}
                  </button>
                </div>
              )}
            </section>

            {/* Approval Notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
              <FiInfo className="flex-shrink-0 text-amber-600 mt-0.5 text-base" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Note:</strong> Your registration will be submitted for admin verification. You will be able to log in once your account is approved.
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
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
