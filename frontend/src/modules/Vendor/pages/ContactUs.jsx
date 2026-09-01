import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiMail, FiPhone, FiUser, FiSend, FiCheckCircle, FiHelpCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { useSettingsStore } from '../../../shared/store/settingsStore';

const VendorContactUs = () => {
  const { settings, initialize } = useSettingsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const general = settings?.general || {};
  const storeName = general.storeName || 'DwellMart';
  const email = general.contactEmail || 'support@dwellmart.com';
  const phone = general.contactPhone || '+91 98765 43210';
  const hours = general.businessHours || 'Mon - Sat, 9:00 AM - 7:00 PM';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    storeName: '',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast.error('Please complete all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/contact', {
        ...formData,
        subject: `Vendor Inquiry: ${formData.storeName || 'New Vendor'}`,
      });
      setIsSubmitted(true);
      toast.success('Your vendor inquiry has been received!');
      setFormData({ name: '', email: '', phone: '', storeName: '', message: '' });
    } catch {
      toast.error('Failed to submit message. Please try calling or emailing directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <Link
            to="/vendor/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <FiArrowLeft className="text-base" /> Back to Vendor Login
          </Link>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 text-emerald-700">
            Vendor Helpdesk
          </span>
        </div>

        {/* Header Hero */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Contact Vendor Support & Onboarding
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-xl">
              Are you an active vendor or interested in selling on DwellMart? Connect with our merchant onboarding and operations team directly.
            </p>
          </div>
          <Link
            to="/vendor/register"
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm shrink-0"
          >
            Vendor Registration
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Direct Support Details Sidebar */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 space-y-6">
              <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                <FiHelpCircle className="text-emerald-600" /> Merchant Help Desk
              </h2>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
                    <FiUser className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Officer</h3>
                    <p className="text-base font-bold text-slate-900 mt-0.5">{storeName} Merchant Operations</p>
                    <p className="text-xs text-slate-500">Vendor Relations & Onboarding</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
                    <FiPhone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Direct Phone / Mobile</h3>
                    <a href={`tel:${phone.replace(/\s+/g, '')}`} className="text-base font-bold text-slate-900 hover:text-emerald-600 mt-0.5 block">
                      {phone}
                    </a>
                    <p className="text-xs text-slate-500 mt-0.5">{hours}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
                    <FiMail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</h3>
                    <a href={`mailto:${email}`} className="text-base font-bold text-slate-900 hover:text-emerald-600 mt-0.5 block">
                      {email}
                    </a>
                    <p className="text-xs text-slate-500 mt-0.5">Response within 24 business hours</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-emerald-600 text-white rounded-2xl p-6 shadow-md">
              <h3 className="font-bold text-base mb-1">Quick Commerce & Wholesale</h3>
              <p className="text-xs text-emerald-100 leading-relaxed">
                List your products for instant local delivery or multi-location B2B distribution through {storeName} vendor services.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-8">
              {isSubmitted ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl">
                    <FiCheckCircle />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Inquiry Submitted!</h3>
                  <p className="text-slate-600 text-sm max-w-sm mx-auto">
                    Thank you. Our merchant operations team will reach out to you shortly.
                  </p>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="px-5 py-2.5 bg-emerald-600 text-white font-bold text-sm rounded-xl hover:bg-emerald-700 transition-all"
                  >
                    Send Another Inquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Send a Direct Vendor Message</h2>
                  <p className="text-xs text-slate-500 mb-4">Fill out the form below to connect directly with vendor support.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
                        placeholder="e.g. Rahul Sharma"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Store / Business Name</label>
                      <input
                        type="text"
                        value={formData.storeName}
                        onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
                        placeholder="e.g. Apex Traders"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
                        placeholder="name@company.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
                        placeholder="9876543210"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Message / Query *</label>
                    <textarea
                      rows={4}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
                      placeholder="Specify your inquiry regarding vendor registration, payouts, or catalog listings..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <FiSend />
                    <span>{isSubmitting ? 'Submitting...' : 'Send Message'}</span>
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

export default VendorContactUs;
