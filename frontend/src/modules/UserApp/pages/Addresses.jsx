import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { FiMapPin, FiEdit, FiTrash2, FiPlus, FiCheck, FiX, FiArrowLeft, FiNavigation } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import MobileLayout from "../components/Layout/MobileLayout";
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import ProtectedRoute from '../../../shared/components/Auth/ProtectedRoute';
import { useAddressStore } from '../../../shared/store/addressStore';
import { useAuthStore } from '../../../shared/store/authStore';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import GoogleMapPicker from '../../../shared/maps/GoogleMapPicker';
import { reverseGeocode } from '../../../shared/maps/googleMaps';

const MobileAddresses = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Saved Addresses',
    'My Addresses',
    'address',
    'addresses',
    'saved',
    'Add Address',
    'Add New Address',
    'Loading addresses...',
    'No addresses saved',
    'Add your first address to get started',
    'Default',
    'Set as Default',
    'Default Delivery Address',
    'Edit',
    'Delete',
    'Edit Address',
    'Update Address',
    'Cancel',
    'Back',
    'Address Label',
    'Home, Work, etc.',
    'Full Name',
    'Phone Number',
    'Street Address',
    'City',
    'State',
    'Zip Code',
    'Country',
    'Address updated successfully!',
    'Address added successfully!',
    'Failed to save address',
    'Address deleted successfully!',
    'Failed to delete address',
    'Default address updated',
    'Failed to set default address',
    'Are you sure you want to delete this address?',
    'Address label is required',
    'Full name is required',
    'Phone number is required',
    'Address is required',
    'City is required',
    'State is required',
    'Zip code is required',
    'Country is required',
    'Use Current Location',
    'Detecting current location...',
    'Address autofilled from current location!',
    'Address details autofilled!',
    'Location permission denied. Please allow location access in your browser.',
    'Unable to retrieve current location.',
    'Geolocation is not supported by your browser',
    'Exact location saved with this address.',
    'Tap on the map or drag the pin to autofill address.',
    'Autofilling...',
    'Exact delivery pin (recommended for Quick Commerce)'
  ]);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { addresses, addAddress, updateAddress, deleteAddress, setDefaultAddress, fetchAddresses, isLoading } =
    useAddressStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      fullName: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      latitude: '',
      longitude: '',
    }
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAddresses().catch(() => null);
  }, [isAuthenticated, fetchAddresses]);

  const openAddForm = () => {
    setEditingAddress(null);
    reset({
      name: '',
      fullName: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      latitude: '',
      longitude: '',
    });
    setIsFormOpen(true);
  };

  const onSubmit = async (data) => {
    try {
      if (editingAddress) {
        await updateAddress(editingAddress.id, data);
        toast.success(t('Address updated successfully!'));
      } else {
        await addAddress(data);
        toast.success(t('Address added successfully!'));
      }
      reset();
      setIsFormOpen(false);
      setEditingAddress(null);
    } catch (error) {
      toast.error(error?.message || t('Failed to save address'));
    }
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    reset({
      name: address.name || '',
      fullName: address.fullName || '',
      phone: address.phone || '',
      address: address.address || '',
      city: address.city || '',
      state: address.state || '',
      zipCode: address.zipCode || '',
      country: address.country || '',
      latitude: address.latitude || '',
      longitude: address.longitude || '',
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('Are you sure you want to delete this address?'))) {
      try {
        await deleteAddress(id);
        toast.success(t('Address deleted successfully!'));
      } catch (error) {
        toast.error(error?.message || t('Failed to delete address'));
      }
    }
  };

  const handleCancel = () => {
    reset({
      name: '',
      fullName: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      latitude: '',
      longitude: '',
    });
    setIsFormOpen(false);
    setEditingAddress(null);
  };

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/profile');
    }
  };

  return (
    <ProtectedRoute>
      <PageTransition>
        <MobileLayout showBottomNav={true} showCartBar={true}>
          <div className="w-full pb-24 min-h-screen bg-surface-muted">
            {/* Header Banner */}
            <div className="px-4 py-4 md:py-6 bg-surface border-b border-border sticky top-0 z-30 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="p-2 hover:bg-surface-muted rounded-full transition-colors cursor-pointer text-content-secondary hover:text-content shrink-0"
                    aria-label="Go Back"
                  >
                    <FiArrowLeft className="text-xl" />
                  </button>
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold text-content">{t('Saved Addresses')}</h1>
                    <p className="text-xs md:text-sm text-content-secondary mt-0.5">
                      {addresses.length} {addresses.length === 1 ? t('address') : t('addresses')} {t('saved')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openAddForm}
                  className="px-5 py-2.5 bg-brand-primary text-black rounded-xl hover:bg-brand-primaryHover transition-all flex items-center justify-center gap-2 font-bold text-sm cursor-pointer shadow-sm self-start sm:self-auto"
                >
                  <FiPlus className="text-lg" />
                  <span>{t('Add New Address')}</span>
                </button>
              </div>
            </div>

            {/* Addresses Main Content Area */}
            <div className="max-w-7xl mx-auto px-4 py-6">
              {isLoading ? (
                <div className="text-center py-16">
                  <p className="text-content-secondary font-medium">{t('Loading addresses...')}</p>
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-16 px-4 bg-surface rounded-2xl border border-border max-w-xl mx-auto shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-4">
                    <FiMapPin className="text-3xl" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-content mb-2">{t('No addresses saved')}</h3>
                  <p className="text-sm text-content-secondary mb-6">{t('Add your first address to get started')}</p>
                  <button
                    type="button"
                    onClick={openAddForm}
                    className="bg-brand-primary text-black px-6 py-2.5 rounded-xl font-bold hover:bg-brand-primaryHover transition-all cursor-pointer inline-flex items-center gap-2 shadow-sm text-sm"
                  >
                    <FiPlus className="text-lg" />
                    <span>{t('Add Address')}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {addresses.map((address) => (
                    <motion.div
                      key={address.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl p-5 bg-surface border border-border hover:border-brand-primary/40 hover:shadow-md transition-all flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                              <FiMapPin className="text-lg" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-content text-base capitalize truncate">{address.name}</h3>
                              <p className="text-xs text-content-muted capitalize truncate">{address.fullName}</p>
                            </div>
                          </div>

                          {address.isDefault ? (
                            <span className="px-2.5 py-1 bg-brand-primary/15 text-brand-primary border border-brand-primary/30 rounded-lg text-xs font-bold shrink-0">
                              {t('Default')}
                            </span>
                          ) : null}
                        </div>

                        {/* Address Details */}
                        <div className="space-y-1 text-sm text-content-secondary py-2 border-t border-border/60">
                          <p className="text-content font-medium leading-relaxed">{address.address}</p>
                          <p className="text-xs text-content-secondary">
                            {address.city}, {address.state} {address.zipCode}
                          </p>
                          <p className="text-xs text-content-secondary font-medium">{address.country}</p>
                          <p className="text-xs text-content-muted pt-1">
                            <span className="font-semibold text-content-secondary">Phone:</span> {address.phone}
                          </p>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border">
                        {!address.isDefault ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await setDefaultAddress(address.id);
                                toast.success(t('Default address updated'));
                              } catch (error) {
                                toast.error(error?.message || t('Failed to set default address'));
                              }
                            }}
                            className="flex-1 py-2 px-3 bg-surface-muted border border-border text-content-secondary hover:text-content rounded-xl font-semibold text-xs hover:bg-border transition-colors cursor-pointer text-center"
                          >
                            {t('Set as Default')}
                          </button>
                        ) : (
                          <div className="flex-1 text-xs text-brand-primary font-semibold py-2">
                            {t('Default Delivery Address')}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEdit(address)}
                          className="py-2 px-3 bg-surface-muted border border-border text-content-secondary hover:text-brand-primary hover:border-brand-primary/30 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                          title={t('Edit Address')}
                        >
                          <FiEdit className="text-sm" />
                          <span>{t('Edit')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(address.id)}
                          className="py-2 px-3 bg-status-errorBg border border-status-error/30 text-status-error rounded-xl hover:opacity-90 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                          title={t('Delete Address')}
                        >
                          <FiTrash2 className="text-sm" />
                          <span>{t('Delete')}</span>
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Address Form Modal */}
          <AddressFormModal
            isOpen={isFormOpen}
            onSubmit={onSubmit}
            onCancel={handleCancel}
            editingAddress={editingAddress}
            register={register}
            handleSubmit={handleSubmit}
            errors={errors}
            setValue={setValue}
            watch={watch}
            t={t}
          />
        </MobileLayout>
      </PageTransition>
    </ProtectedRoute>
  );
};

// Address Form Modal Component
const AddressFormModal = ({
  isOpen,
  onSubmit,
  onCancel,
  editingAddress,
  register,
  handleSubmit,
  errors,
  setValue,
  watch,
  t,
}) => {
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const [isLocating, setIsLocating] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Prevent background scrolling while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const fillAddressFields = (geoData, notify = true, message = '') => {
    if (geoData.address) setValue('address', geoData.address, { shouldValidate: true });
    if (geoData.city) setValue('city', geoData.city, { shouldValidate: true });
    if (geoData.state) setValue('state', geoData.state, { shouldValidate: true });
    if (geoData.zipCode) setValue('zipCode', geoData.zipCode, { shouldValidate: true });
    if (geoData.country) setValue('country', geoData.country, { shouldValidate: true });
    if (notify) {
      toast.success(message || t('Address details autofilled!'));
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t('Geolocation is not supported by your browser'));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setValue('latitude', lat);
        setValue('longitude', lng);

        try {
          const geoData = await reverseGeocode({ latitude: lat, longitude: lng });
          fillAddressFields(geoData, true, t('Address autofilled from current location!'));
        } catch {
          toast.success(t('Location detected. Please fill in any missing address details.'));
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error(t('Location permission denied. Please allow location access in your browser.'));
        } else {
          toast.error(t('Unable to retrieve current location.'));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleMapPinChange = async ({ latitude: nextLatitude, longitude: nextLongitude }) => {
    const lat = Number(Number(nextLatitude).toFixed(6));
    const lng = Number(Number(nextLongitude).toFixed(6));
    setValue('latitude', lat);
    setValue('longitude', lng);

    setIsReverseGeocoding(true);
    try {
      const geoData = await reverseGeocode({ latitude: lat, longitude: lng });
      fillAddressFields(geoData, false);
    } catch {
      // Silently ignore if reverse geocode fails on pin repositioning
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="address-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onCancel}
        >
          <motion.div
            key="address-modal-dialog"
            initial={{ y: '100%', opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col border border-border shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border bg-surface sticky top-0 z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={onCancel}
                  className="p-1.5 -ml-1.5 hover:bg-surface-muted rounded-full text-content transition-colors cursor-pointer"
                  title={t('Back')}
                  aria-label="Back"
                >
                  <FiArrowLeft className="text-xl" />
                </button>
                <h2 className="text-lg font-bold text-content truncate">
                  {editingAddress ? t('Edit Address') : t('Add New Address')}
                </h2>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 -mr-1.5 hover:bg-surface-muted rounded-full text-content-secondary hover:text-content transition-colors cursor-pointer"
                title={t('Cancel')}
                aria-label="Close"
              >
                <FiX className="text-xl" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 scrollbar-admin">
              {/* Use Current Location Button */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-bold text-sm hover:bg-brand-primary/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                <FiNavigation className={`text-base shrink-0 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? t('Detecting current location...') : t('Use Current Location')}</span>
              </button>

              <form id="address-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Address Label')}</label>
                  <input
                    type="text"
                    {...register('name', { required: t('Address label is required') })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${errors.name ? 'border-status-error' : 'border-border'
                      } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                    placeholder={t('Home, Work, etc.')}
                  />
                  {errors.name && <p className="mt-1 text-xs text-status-error">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Full Name')}</label>
                  <input
                    type="text"
                    {...register('fullName', { required: t('Full name is required') })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${errors.fullName ? 'border-status-error' : 'border-border'
                      } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-status-error">{errors.fullName.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Phone Number')}</label>
                  <input
                    type="tel"
                    {...register('phone', { required: t('Phone number is required') })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${errors.phone ? 'border-status-error' : 'border-border'
                      } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-status-error">{errors.phone.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Street Address')}</label>
                  <input
                    type="text"
                    {...register('address', { required: t('Address is required') })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${errors.address ? 'border-status-error' : 'border-border'
                      } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                  />
                  {errors.address && (
                    <p className="mt-1 text-xs text-status-error">{errors.address.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('City')}</label>
                    <input
                      type="text"
                      {...register('city', { required: t('City is required') })}
                      className={`w-full px-3 py-2.5 rounded-xl border ${errors.city ? 'border-status-error' : 'border-border'
                        } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('State')}</label>
                    <input
                      type="text"
                      {...register('state', { required: t('State is required') })}
                      className={`w-full px-3 py-2.5 rounded-xl border ${errors.state ? 'border-status-error' : 'border-border'
                        } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Zip Code')}</label>
                    <input
                      type="text"
                      {...register('zipCode', { required: t('Zip code is required') })}
                      className={`w-full px-3 py-2.5 rounded-xl border ${errors.zipCode ? 'border-status-error' : 'border-border'
                        } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Country')}</label>
                  <input
                    type="text"
                    {...register('country', { required: t('Country is required') })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${errors.country ? 'border-status-error' : 'border-border'
                      } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5">{t('Exact delivery pin (recommended for Quick Commerce)')}</label>
                  <GoogleMapPicker
                    value={{ latitude, longitude }}
                    onChange={handleMapPinChange}
                    height={180}
                  />
                  <div className="mt-1 text-xs text-content-muted flex items-center justify-between">
                    <span>
                      {Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
                        ? t('Exact location saved with this address.')
                        : t('Tap on the map or drag the pin to autofill address.')}
                    </span>
                    {isReverseGeocoding && (
                      <span className="text-brand-primary font-semibold animate-pulse">{t('Autofilling...')}</span>
                    )}
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 border-t border-border bg-surface flex gap-2.5 shrink-0">
              <button
                type="submit"
                form="address-form"
                className="flex-1 bg-brand-primary text-black py-2.5 rounded-xl font-bold hover:bg-brand-primaryHover transition-all text-sm cursor-pointer shadow-xs"
              >
                {editingAddress ? t('Update Address') : t('Add Address')}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 bg-surface-muted text-content-secondary border border-border rounded-xl font-semibold hover:bg-border transition-colors text-sm cursor-pointer"
              >
                {t('Cancel')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MobileAddresses;
