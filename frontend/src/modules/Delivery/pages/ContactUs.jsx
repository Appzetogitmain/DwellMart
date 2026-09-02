import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiMail, FiPhone, FiUser, FiSend, FiCheckCircle, FiHelpCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { useSettingsStore } from '../../../shared/store/settingsStore';

const DeliveryContactUs = () => {
  const { settings, initialize } = useSettingsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const general = settings?.general || {};
  const storeName = general.storeName || 'Dwell Mart';
  const email = general.contactEmail || 'support@dwellmart.com';
  const phone = general.contactPhone || '+91 98765 43210';
  const hours = general.businessHours || 'Available 24/7 for active delivery support';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim() || !formData.message.trim()) {
      toast.error('Please complete required fields (Name, Phone, Message).');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/contact', {
        ...formData,
        subject: `Delivery Partner Inquiry (${formData.city || 'General'})`,
      });
      setIsSubmitted(true);
      toast.success('Your rider inquiry has been submitted successfully!');
      setFormData({ name: '', email: '', phone: '', city: '', message: '' });
    } catch {
      toast.error('Failed to send message. Please call or email directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <Link
            to="/delivery/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <FiArrowLeft className="text-base" /> Back to Delivery Login
          </Link>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
            Rider Support Desk
          </span>
        </div>

        {/* Hero Banner */}
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-amber-500/20 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Delivery Partner Contact & Support
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-xl">
              Need assistance with rider registration, app support, cash settlements, or order routing? Reach out to our fleet management team.
            </p>
          </div>
          <Link
            to="/delivery/register"
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-md shrink-0 hover:from-amber-400 hover:to-amber-500"
          >
            Become a Delivery Partner
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Support Details Sidebar */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 p-6 space-y-6">
              <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
                <FiHelpCircle className="text-amber-400" /> Fleet Support Contact
              </h2>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl shrink-0">
                    <FiUser className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fleet Support Team</h3>
                    <p className="text-base font-bold text-white mt-0.5">{storeName} Fleet Management</p>
                    <p className="text-xs text-slate-400">Delivery Operations & Rider Support</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl shrink-0">
                    <FiPhone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Direct Helpline / Mobile</h3>
                    <a href={`tel:${phone.replace(/\s+/g, '')}`} className="text-base font-bold text-amber-400 hover:underline mt-0.5 block">
                      {phone}
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5">{hours}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl shrink-0">
                    <FiMail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</h3>
                    <a href={`mailto:${email}`} className="text-base font-bold text-amber-400 hover:underline mt-0.5 block">
                      {email}
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5">Response within 12-24 hours</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6">
              <h3 className="font-bold text-base text-amber-400 mb-1">Instant Payouts & Flexible Shifts</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enjoy automated weekly payouts, peak delivery bonuses, and 24/7 dedicated partner helpline support.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-7">
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 p-6 sm:p-8">
              {isSubmitted ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto text-3xl">
                    <FiCheckCircle />
                  </div>
                  <h3 className="text-xl font-bold text-white">Rider Inquiry Sent!</h3>
                  <p className="text-slate-400 text-sm max-w-sm mx-auto">
                    Thank you. Our fleet team will review your query and contact you promptly.
                  </p>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="px-5 py-2.5 bg-amber-500 text-slate-950 font-bold text-sm rounded-xl hover:bg-amber-400 transition-all"
                  >
                    Submit Another Query
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h2 className="text-lg font-bold text-white mb-1">Send a Direct Rider Inquiry</h2>
                  <p className="text-xs text-slate-400 mb-4">Complete the form below to contact our delivery support desk.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all outline-none"
                        placeholder="e.g. Vikram Singh"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Number *</label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all outline-none"
                        placeholder="9876543210"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all outline-none"
                        placeholder="rider@gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">City / Region</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all outline-none"
                        placeholder="e.g. Indore / Delhi"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Message / Question *</label>
                    <textarea
                      rows={4}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all outline-none"
                      placeholder="Enter your inquiry regarding onboarding, cash settlements, or order assignments..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <FiSend />
                    <span>{isSubmitting ? 'Submitting...' : 'Submit Inquiry'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryContactUs;
