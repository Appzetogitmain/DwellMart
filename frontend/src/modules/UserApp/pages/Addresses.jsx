import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FiMapPin, FiEdit, FiTrash2, FiPlus, FiCheck, FiX, FiArrowLeft } from 'react-icons/fi';
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

const MobileAddresses = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Saved Addresses',
    'Add Address',
    'Loading addresses...',
    'No addresses saved',
    'Add your first address to get started',
    'Default',
    'Set as Default',
    'Edit Address',
    'Add New Address',
    'Update Address',
    'Cancel',
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
    'Country is required'
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
  } = useForm();

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAddresses().catch(() => null);
  }, [isAuthenticated, fetchAddresses]);

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
    reset(address);
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
    reset();
    setIsFormOpen(false);
    setEditingAddress(null);
  };

  return (
    <ProtectedRoute>
      <PageTransition>
        <MobileLayout showBottomNav={true} showCartBar={true}>
          <div className="w-full pb-24 min-h-screen bg-surface-muted">
            {/* Header */}
            <div className="px-4 py-4 bg-surface border-b border-border sticky top-1 z-30">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-surface-muted rounded-full transition-colors"
                >
                  <FiArrowLeft className="text-xl text-content-secondary" />
                </button>
                <h1 className="text-xl font-bold text-content flex-1">{t('Saved Addresses')}</h1>
                <button
                  onClick={() => setIsFormOpen(true)}
                  className="p-2 bg-brand-primary text-black rounded-xl hover:bg-brand-primaryHover transition-all"
                >
                  <FiPlus className="text-xl" />
                </button>
              </div>
            </div>

            {/* Addresses List */}
            <div className="px-4 py-4">
              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-content-secondary">{t('Loading addresses...')}</p>
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-12">
                  <FiMapPin className="text-6xl text-content-muted mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-content mb-2">{t('No addresses saved')}</h3>
                  <p className="text-content-secondary mb-6">{t('Add your first address to get started')}</p>
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-brand-primary text-black px-6 py-3 rounded-xl font-semibold hover:bg-brand-primaryHover transition-all"
                  >
                    {t('Add Address')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address) => (
                    <motion.div
                      key={address.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-card rounded-2xl p-4 bg-surface border border-border"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3 flex-1">
                          <FiMapPin className="text-brand-primary text-xl mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-content text-base">{address.name}</h3>
                              {address.isDefault && (
                                <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary border border-brand-primary/30 rounded text-xs font-semibold">
                                  {t('Default')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-content-secondary mb-1">{address.fullName}</p>
                            <p className="text-sm text-content-secondary mb-1">{address.address}</p>
                            <p className="text-sm text-content-secondary">
                              {address.city}, {address.state} {address.zipCode}
                            </p>
                            <p className="text-sm text-content-secondary">{address.country}</p>
                            <p className="text-sm text-content-muted mt-1">Phone: {address.phone}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-border">
                        {!address.isDefault && (
                          <button
                            onClick={async () => {
                              try {
                                await setDefaultAddress(address.id);
                                toast.success(t('Default address updated'));
                              } catch (error) {
                                toast.error(error?.message || t('Failed to set default address'));
                              }
                            }}
                            className="flex-1 py-2 bg-surface-muted border border-border text-content-secondary rounded-xl font-semibold text-sm hover:bg-border transition-colors"
                          >
                            {t('Set as Default')}
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(address)}
                          className="p-2 bg-surface-muted border border-border text-brand-primary rounded-xl hover:bg-border transition-colors"
                        >
                          <FiEdit className="text-base" />
                        </button>
                        <button
                          onClick={() => handleDelete(address.id)}
                          className="p-2 bg-status-errorBg border border-status-error/30 text-status-error rounded-xl hover:opacity-90 transition-colors"
                        >
                          <FiTrash2 className="text-base" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Address Form Modal */}
          <AnimatePresence>
            {isFormOpen && (
              <AddressFormModal
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
            )}
          </AnimatePresence>
        </MobileLayout>
      </PageTransition>
    </ProtectedRoute>
  );
};

// Address Form Modal Component
const AddressFormModal = ({
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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-t-3xl p-6 w-full max-h-[90vh] overflow-y-auto border-t border-border"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-content">
            {editingAddress ? t('Edit Address') : t('Add New Address')}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-surface-muted rounded-full">
            <FiX className="text-xl text-content-secondary" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Address Label')}</label>
            <input
              type="text"
              {...register('name', { required: t('Address label is required') })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.name ? 'border-status-error' : 'border-border'
                } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
              placeholder={t('Home, Work, etc.')}
            />
            {errors.name && <p className="mt-1 text-sm text-status-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Full Name')}</label>
            <input
              type="text"
              {...register('fullName', { required: t('Full name is required') })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.fullName ? 'border-status-error' : 'border-border'
                } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
            />
            {errors.fullName && (
              <p className="mt-1 text-sm text-status-error">{errors.fullName.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Phone Number')}</label>
            <input
              type="tel"
              {...register('phone', { required: t('Phone number is required') })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.phone ? 'border-status-error' : 'border-border'
                } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
            />
            {errors.phone && <p className="mt-1 text-sm text-status-error">{errors.phone.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Street Address')}</label>
            <input
              type="text"
              {...register('address', { required: t('Address is required') })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.address ? 'border-status-error' : 'border-border'
                } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
            />
            {errors.address && (
              <p className="mt-1 text-sm text-status-error">{errors.address.message}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">{t('City')}</label>
              <input
                type="text"
                {...register('city', { required: t('City is required') })}
                className={`w-full px-4 py-3 rounded-xl border-2 ${errors.city ? 'border-status-error' : 'border-border'
                  } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">{t('State')}</label>
              <input
                type="text"
                {...register('state', { required: t('State is required') })}
                className={`w-full px-4 py-3 rounded-xl border-2 ${errors.state ? 'border-status-error' : 'border-border'
                  } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Zip Code')}</label>
              <input
                type="text"
                {...register('zipCode', { required: t('Zip code is required') })}
                className={`w-full px-4 py-3 rounded-xl border-2 ${errors.zipCode ? 'border-status-error' : 'border-border'
                  } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Country')}</label>
            <input
              type="text"
              {...register('country', { required: t('Country is required') })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.country ? 'border-status-error' : 'border-border'
                } bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary text-base`}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-content-secondary mb-2">Exact delivery pin (recommended for Quick Commerce)</label>
            <GoogleMapPicker
              value={{ latitude, longitude }}
              onChange={({ latitude: nextLatitude, longitude: nextLongitude }) => {
                setValue('latitude', Number(nextLatitude.toFixed(6)));
                setValue('longitude', Number(nextLongitude.toFixed(6)));
              }}
              height={210}
            />
            <p className="mt-1 text-xs text-content-muted">
              {Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
                ? "Exact location saved with this address."
                : "Optional. You can still save a manual address."}
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-brand-primary text-black py-3 rounded-xl font-semibold hover:bg-brand-primaryHover transition-all"
            >
              {editingAddress ? t('Update Address') : t('Add Address')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-surface-muted text-content-secondary border border-border rounded-xl font-semibold hover:bg-border transition-colors"
            >
              {t('Cancel')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default MobileAddresses;

