import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiMail, FiPhone, FiMapPin, FiClock, FiSend, FiCheckCircle, FiArrowLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import PageTransition from '../../../shared/components/PageTransition';
import { useSettingsStore } from '../../../shared/store/settingsStore';
import PublicPageLayout from '../components/Layout/PublicPageLayout';

const ContactUs = () => {
  const { settings, initialize } = useSettingsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const general = settings?.general || {};
  const storeName = general.storeName || 'DwellMart';
  const email = general.contactEmail || 'support@dwellmart.com';
  const phone = general.contactPhone || '+91 98765 43210';
  const address = general.address || '123 Commerce Street, Tech Park, New Delhi, India';
  const hours = general.businessHours || 'Mon-Sat 9AM-8PM';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    if (!formData.message.trim()) {
      toast.error('Please enter your message');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/contact', formData);
      const message = response?.data?.message || response?.message || 'Message sent successfully!';
      toast.success(message);
      setIsSubmitted(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: 'General Inquiry',
        message: '',
      });
    } catch (error) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to send message. Please try again.';
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicPageLayout>
      <PageTransition>
        <div className="bg-surface-muted text-content py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Top Header */}
            <div className="mb-8">
              <Link
                to="/home"
                className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-brand-primary transition-colors mb-4"
              >
                <FiArrowLeft className="text-base" /> Back to Home
              </Link>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-content tracking-tight">
                Contact <span className="text-brand-primary">{storeName}</span> Support
              </h1>
              <p className="text-content-secondary mt-2 text-base max-w-2xl">
                Have a question, feedback, or need assistance with your order or vendor partnership? We are here to help you.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
              {/* Contact Info Sidebar */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-xl">
                  <h3 className="text-xl font-bold text-content mb-6 border-b border-border pb-3 flex items-center gap-2">
                    Get in Touch
                  </h3>

                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary text-xl shrink-0">
                        <FiMail />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-content-secondary">Email Us</h4>
                        <p className="text-content font-medium text-base mt-0.5">{email}</p>
                        <p className="text-xs text-content-muted mt-1">Our support team responds promptly.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary text-xl shrink-0">
                        <FiPhone />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-content-secondary">Call Us</h4>
                        <p className="text-content font-medium text-base mt-0.5">{phone}</p>
                        <p className="text-xs text-content-muted mt-1">{hours}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary text-xl shrink-0">
                        <FiMapPin />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-content-secondary">Address</h4>
                        <p className="text-content font-medium text-base mt-0.5">{address}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary text-xl shrink-0">
                        <FiClock />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-content-secondary">Business Hours</h4>
                        <p className="text-content font-medium text-base mt-0.5">{hours}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vendor Banner */}
                <div className="bg-surface-elevated border border-brand-primary/30 rounded-2xl p-6">
                  <h4 className="text-lg font-bold text-content">Are you a merchant or brand?</h4>
                  <p className="text-sm text-content-secondary mt-1">
                    Sell your products nationwide on DwellMart with automated onboarding and billing.
                  </p>
                  <Link
                    to="/sell-on-dwellmart"
                    className="inline-block mt-4 px-4 py-2 bg-brand-primary text-black font-extrabold text-xs rounded-lg hover:bg-brand-primaryHover transition-colors shadow-md"
                  >
                    Register as Vendor
                  </Link>
                </div>
              </div>

              {/* Contact Form */}
              <div className="lg:col-span-7">
                <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-xl">
                  {isSubmitted ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12 space-y-4"
                    >
                      <div className="w-16 h-16 bg-brand-primary/20 text-brand-primary rounded-full flex items-center justify-center mx-auto text-3xl border border-brand-primary/40">
                        <FiCheckCircle />
                      </div>
                      <h3 className="text-2xl font-bold text-content">Message Sent Successfully!</h3>
                      <p className="text-content-secondary max-w-md mx-auto text-sm leading-relaxed">
                        Thank you for reaching out to DwellMart. Your inquiry has been routed directly to our support email inbox. We will get back to you shortly.
                      </p>
                      <button
                        onClick={() => setIsSubmitted(false)}
                        className="mt-6 px-6 py-2.5 bg-brand-primary text-black font-extrabold text-sm rounded-xl hover:bg-brand-primaryHover transition-all shadow-md"
                      >
                        Send Another Message
                      </button>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <h3 className="text-xl font-bold text-content mb-2">Send Us a Direct Message</h3>
                      <p className="text-xs text-content-secondary mb-6">
                        Fill in the details below and your message will be emailed directly to our customer support team.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                            Your Full Name <span className="text-status-warning">*</span>
                          </label>
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="e.g. John Doe"
                            required
                            className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl text-sm text-content placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                            Email Address <span className="text-status-warning">*</span>
                          </label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="name@example.com"
                            required
                            className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl text-sm text-content placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                            Phone Number (Optional)
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="+91 98765 43210"
                            className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl text-sm text-content placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                            Inquiry Subject
                          </label>
                          <select
                            name="subject"
                            value={formData.subject}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl text-sm text-content focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                          >
                            <option value="General Inquiry">General Inquiry</option>
                            <option value="Order Status & Delivery">Order Status & Delivery</option>
                            <option value="Vendor Partnership">Vendor Partnership</option>
                            <option value="Returns & Refunds">Returns & Refunds</option>
                            <option value="Technical Support">Technical Support</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                          Your Message <span className="text-status-warning">*</span>
                        </label>
                        <textarea
                          name="message"
                          rows="5"
                          value={formData.message}
                          onChange={handleChange}
                          placeholder="How can we assist you today? Please provide as many details as possible..."
                          required
                          className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl text-sm text-content placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all resize-none"
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3.5 px-6 bg-brand-primary text-black font-extrabold text-sm rounded-xl hover:bg-brand-primaryHover transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <span>Sending Email...</span>
                        ) : (
                          <>
                            <FiSend className="text-base" />
                            <span>Send Message to Support Email</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageTransition>
    </PublicPageLayout>
  );
};

export default ContactUs;
