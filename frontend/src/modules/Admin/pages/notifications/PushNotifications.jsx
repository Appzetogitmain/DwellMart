import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FiSend,
  FiBell,
  FiTarget,
  FiUsers,
  FiCheckCircle,
  FiXCircle,
  FiLoader,
  FiFileText,
  FiImage,
  FiUpload,
  FiTrash2,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';
import { broadcastPushNotification, getCustomMessages, uploadAdminImage } from '../../services/adminService';

const PushNotifications = () => {
  const location = useLocation();
  const preloadedTemplate = location.state?.template;
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    title: preloadedTemplate?.title || '',
    message: preloadedTemplate?.content || preloadedTemplate?.message || '',
    target: 'all',
    category: preloadedTemplate?.category || 'MARKETING',
    priority: preloadedTemplate?.priority || 'NORMAL',
    actionUrl: preloadedTemplate?.actionUrl || '',
    image: preloadedTemplate?.image || '',
  });

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(preloadedTemplate?._id || '');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // Load custom message templates for the dropdown
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const res = await getCustomMessages({ limit: 100, status: 'active' });
        const data = res?.data || res || {};
        setTemplates(data.messages || []);
      } catch (err) {
        console.warn('Failed to load custom message templates:', err.message);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, []);

  // Handle template selection
  const handleSelectTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const tpl = templates.find((t) => t._id === templateId);
    if (tpl) {
      setFormData((prev) => ({
        ...prev,
        title: tpl.title || '',
        message: tpl.content || '',
        category: tpl.category || 'MARKETING',
        priority: tpl.priority || 'NORMAL',
        actionUrl: tpl.actionUrl || '',
        image: tpl.image || prev.image || '',
      }));
      toast.success(`Loaded template: "${tpl.title}"`);
    }
  };

  // Image Upload Handler
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG, JPG, WEBP, etc.).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB.');
      return;
    }

    setIsUploadingImage(true);
    try {
      const res = await uploadAdminImage(file, 'notifications');
      const imageUrl = res?.data?.url || res?.data?.data?.url || res?.url;
      if (imageUrl) {
        setFormData((prev) => ({ ...prev, image: imageUrl }));
        toast.success('Notification image uploaded!');
      } else {
        throw new Error('Image URL was not returned');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to upload image.';
      toast.error(msg);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, image: '' }));
    toast.success('Image removed.');
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Title and message are required.');
      return;
    }

    if (!formData.target) {
      toast.error('Target audience is required.');
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      const res = await broadcastPushNotification({
        title: formData.title.trim(),
        message: formData.message.trim(),
        target: formData.target,
        image: formData.image || undefined,
        category: formData.category,
        priority: formData.priority,
        actionUrl: formData.actionUrl.trim(),
      });

      const data = res?.data || res;
      setLastResult(data);

      const sent = data?.fcmSent ?? 0;
      const total = data?.recipients ?? 0;
      toast.success(
        `Notification sent! ${sent} push(es) delivered to ${total} recipient(s).`,
        { duration: 5000 }
      );

      setFormData({
        title: '',
        message: '',
        target: 'all',
        category: 'MARKETING',
        priority: 'NORMAL',
        actionUrl: '',
        image: '',
      });
      setSelectedTemplateId('');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to send notification.';
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Push Notifications</h1>
        <p className="text-sm sm:text-base text-gray-600">Broadcast push notifications to users</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Template Quick Loader */}
        <div className="mb-6 p-4 bg-primary-50/50 border border-primary-100 rounded-xl">
          <label className="block text-sm font-semibold text-primary-900 mb-2 flex items-center gap-2">
            <FiFileText className="text-primary-600" />
            Load Saved Custom Message Template (Optional)
          </label>
          <AnimatedSelect
            value={selectedTemplateId}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            disabled={isLoadingTemplates}
            options={[
              { value: '', label: isLoadingTemplates ? 'Loading templates...' : '-- Select a Template to Auto-Fill --' },
              ...templates.map((t) => ({
                value: t._id,
                label: `[${t.type}] ${t.title}`,
              })),
            ]}
          />
          {selectedTemplateId && (
            <p className="text-xs text-primary-700 mt-1 font-medium">
              ✨ Template auto-filled below! You can edit text, add an image, or change target audience before sending.
            </p>
          )}
        </div>

        <form onSubmit={handleSend} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiBell className="inline mr-2" />
              Notification Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter notification title"
              required
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Enter notification message"
              required
              rows={4}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Image Upload / Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <FiImage />
              Notification Image <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>

            {formData.image ? (
              <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50 max-w-md p-3 flex items-center gap-4">
                <img
                  src={formData.image}
                  alt="Notification preview"
                  className="w-24 h-20 object-cover rounded-lg border border-gray-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{formData.image}</p>
                  <p className="text-[11px] text-green-600 font-medium mt-0.5">✓ Image attached to broadcast</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
                    >
                      Change
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 underline flex items-center gap-1"
                    >
                      <FiTrash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {isUploadingImage ? (
                    <>
                      <FiLoader className="animate-spin" />
                      <span>Uploading Image...</span>
                    </>
                  ) : (
                    <>
                      <FiUpload />
                      <span>Upload Banner Image</span>
                    </>
                  )}
                </button>
                <span className="text-xs text-gray-400">PNG, JPG, WEBP up to 5MB</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Target Audience — Segmented */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiTarget className="inline mr-2" />
              Target Audience <span className="text-red-500">*</span>
            </label>
            <AnimatedSelect
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              options={[
                { value: 'all', label: 'All (Customers + Vendors + Delivery)' },
                { value: 'customers', label: 'Customers Only' },
                { value: 'vendors', label: 'Vendors: All Vendors' },
                { value: 'retail-vendors', label: 'Vendors: Retail Vendors' },
                { value: 'quick-commerce-vendors', label: 'Vendors: Quick Commerce Vendors' },
                { value: 'wholesale-vendors', label: 'Vendors: Wholesale Vendors' },
                { value: 'delivery', label: 'Delivery Partners Only' },
              ]}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <AnimatedSelect
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={[
                { value: 'MARKETING', label: 'Marketing' },
                { value: 'PROMOTION', label: 'Promotion' },
                { value: 'INFO', label: 'Info' },
                { value: 'WARNING', label: 'Warning' },
                { value: 'SYSTEM', label: 'System' },
              ]}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <AnimatedSelect
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'NORMAL', label: 'Normal' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
          </div>

          {/* Action URL (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Action URL <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.actionUrl}
              onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
              placeholder="e.g. /products or /orders"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSending || isUploadingImage}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <>
                <FiLoader className="animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <FiSend />
                <span>Send Notification</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Delivery Stats */}
      <AnimatePresence>
        {lastResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          >
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <FiUsers />
              Last Broadcast Result
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Recipients Resolved', value: lastResult.recipients ?? '—', color: 'text-gray-700' },
                { label: 'Device Tokens Found', value: lastResult.tokensFound ?? '—', color: 'text-blue-600' },
                { label: 'FCM Sent', value: lastResult.fcmSent ?? '—', color: 'text-green-600', icon: FiCheckCircle },
                { label: 'FCM Failed', value: lastResult.fcmFailed ?? '—', color: 'text-red-500', icon: FiXCircle },
                { label: 'In-App Created', value: lastResult.inAppCreated ?? '—', color: 'text-purple-600' },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className={`text-2xl font-bold ${color} flex items-center justify-center gap-1`}>
                    {Icon && <Icon className="text-lg" />}
                    {value}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PushNotifications;
