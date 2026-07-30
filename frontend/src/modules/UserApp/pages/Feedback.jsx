import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiSend, FiCheckCircle, FiArrowLeft, FiStar } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import PageTransition from '../../../shared/components/PageTransition';
import { useAuthStore } from '../../../shared/store/authStore';
import { useSettingsStore } from '../../../shared/store/settingsStore';

const Feedback = () => {
  const { user } = useAuthStore();
  const { settings, initialize } = useSettingsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const general = settings?.general || {};
  const storeName = general.storeName || 'DwellMart';

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    rating: 5,
    category: 'General',
    message: '',
  });

  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleRating = (value) => {
    setFormData({ ...formData, rating: value });
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
      toast.error('Please enter your feedback');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        userId: user?._id || undefined,
      };
      const response = await api.post('/feedback', payload);
      const message = response?.data?.message || response?.message || 'Feedback submitted successfully!';
      toast.success(message);
      setIsSubmitted(true);
      setFormData({
        name: user?.name || '',
        email: user?.email || '',
        rating: 5,
        category: 'General',
        message: '',
      });
    } catch (error) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to submit feedback. Please try again.';
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-900 text-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Top Header */}
          <div className="mb-8 text-center">
            <div className="flex justify-center mb-4">
              <Link
                to="/home"
                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-[#ffc101] transition-colors"
              >
                <FiArrowLeft className="text-base" /> Back to Home
              </Link>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Rate Your Experience with <span className="text-[#ffc101]">{storeName}</span>
            </h1>
            <p className="text-gray-400 mt-2 text-base max-w-2xl mx-auto">
              We value your feedback. Let us know how we are doing and how we can improve.
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-10 shadow-xl max-w-2xl mx-auto">
            {isSubmitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12 space-y-4"
              >
                <div className="w-16 h-16 bg-[#ffc101]/20 text-[#ffc101] rounded-full flex items-center justify-center mx-auto text-3xl border border-[#ffc101]/40">
                  <FiCheckCircle />
                </div>
                <h3 className="text-2xl font-bold text-white">Thank You!</h3>
                <p className="text-gray-300 max-w-md mx-auto text-sm leading-relaxed">
                  Your feedback has been submitted successfully. We appreciate you taking the time to help us improve!
                </p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="mt-6 px-6 py-2.5 bg-[#ffc101] text-black font-extrabold text-sm rounded-xl hover:bg-[#e6ac00] transition-all shadow-md"
                >
                  Submit More Feedback
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="flex flex-col items-center justify-center space-y-2 mb-8 border-b border-slate-700 pb-8">
                  <label className="text-sm font-semibold text-gray-300">How would you rate us?</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="focus:outline-none transition-transform hover:scale-110"
                      >
                        <FiStar
                          className={`text-4xl ${
                            (hoverRating || formData.rating) >= star
                              ? 'text-[#ffc101] fill-[#ffc101]'
                              : 'text-gray-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                      Your Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g. John Doe"
                      required
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#ffc101] focus:ring-1 focus:ring-[#ffc101] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                      Email Address <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="name@example.com"
                      required
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#ffc101] focus:ring-1 focus:ring-[#ffc101] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Feedback Category
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-[#ffc101] focus:ring-1 focus:ring-[#ffc101] transition-all"
                  >
                    <option value="General">General Experience</option>
                    <option value="UI/UX">Website Design (UI/UX)</option>
                    <option value="Bug">Report a Bug</option>
                    <option value="Suggestion">Feature Suggestion</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Your Feedback <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    name="message"
                    rows="4"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us what you loved or what we can improve..."
                    required
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#ffc101] focus:ring-1 focus:ring-[#ffc101] transition-all resize-none"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-6 bg-[#ffc101] text-black font-extrabold text-sm rounded-xl hover:bg-[#e6ac00] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Submitting...</span>
                  ) : (
                    <>
                      <FiSend className="text-base" />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default Feedback;
