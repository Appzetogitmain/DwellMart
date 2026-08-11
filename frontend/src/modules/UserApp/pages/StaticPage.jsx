import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiClock } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import PublicPageLayout from '../components/Layout/PublicPageLayout';

// Map slug → display title (fallback if admin left title blank)
const DEFAULT_TITLES = {
  about: 'About Us',
  contact: 'Contact Us',
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  returns: 'Returns & Exchanges',
  shipping: 'Shipping Policy',
  faq: 'FAQs',
  partner: 'Become a Partner',
};

const formatContent = (content) => {
  if (!content) return '';
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return content;
  }
  return content
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${line}</p>` : '<br/>'))
    .join('');
};

const DEFAULT_PRIVACY_CONTENT = `
<h2>1. Introduction</h2>
<p>Welcome to DwellMart. Your privacy is of utmost importance to us. This Privacy Policy outlines how we collect, process, store, and safeguard your personal information across our website and mobile applications.</p>

<h2>2. Information We Collect</h2>
<p>We collect information that you voluntarily provide when creating an account, browsing products, placing orders, or contacting customer support. This includes your full name, email address, contact number, delivery addresses, and transactional information.</p>

<h2>3. Data Protection & Privacy Officer</h2>
<p>For any privacy inquiries, data access requests, or policy feedback, please contact our designated Privacy Officer:</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0;">
  <p style="margin: 0 0 6px 0;"><strong>Name:</strong> Devesh Lal</p>
  <p style="margin: 0 0 6px 0;"><strong>Mobile:</strong> 9999188143</p>
  <p style="margin: 0;"><strong>Email:</strong> <a href="mailto:davesh0007@gmail.com" style="color: #2563eb;">davesh0007@gmail.com</a></p>
</div>

<h2>4. How We Use Your Data</h2>
<p>Your data is strictly used to process marketplace orders, coordinate quick delivery services, send real-time order notifications, prevent fraudulent activities, and improve user experience.</p>

<h2>5. Data Security & Third Parties</h2>
<p>We implement robust encryption and security standards. We never sell your personal data. Data is shared exclusively with verified vendors, payment gateways, and delivery partners solely for order fulfillment.</p>
`;

const StaticPage = ({ slug: slugProp }) => {
  // Accept slug either from props (used in App.jsx) or from URL params
  const params = useParams();
  const slug = slugProp || params.slug;

  const [page, setPage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    setNotFound(false);

    api.get(`/pages/${slug}`)
      .then((res) => {
        const data = res.data?.data || res.data;
        setPage(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [slug]);

  const pageTitle = page?.title || DEFAULT_TITLES[slug] || 'Page';
  const effectiveContent = page?.content || (slug === 'privacy' ? DEFAULT_PRIVACY_CONTENT : null);

  let bodyContent = null;

  if (isLoading) {
    bodyContent = (
      <div className="py-12 px-4">
        <div className="max-w-3xl mx-auto animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/4" />
          <div className="space-y-3 mt-6">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${85 + (i % 3) * 5}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  } else if (!effectiveContent && (notFound || !page)) {
    bodyContent = (
      <div className="py-16 px-4 flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <p className="text-6xl">📄</p>
          <h1 className="text-2xl font-bold text-gray-800">{DEFAULT_TITLES[slug] || 'Page Not Found'}</h1>
          <p className="text-gray-500 max-w-sm">This page is being prepared. Check back soon.</p>
          <Link to="/" className="inline-flex items-center gap-2 mt-4 text-primary-600 hover:underline font-medium">
            <FiArrowLeft /> Back to Home
          </Link>
        </div>
      </div>
    );
  } else {
    bodyContent = (
      <div className="py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Back link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors mb-6 font-medium"
          >
            <FiArrowLeft className="text-base" />
            Back to Home
          </Link>

          {/* Header Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 px-6 sm:px-8 pt-8 pb-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">{pageTitle}</h1>
            {page?.lastUpdated && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                <FiClock />
                Last updated: {new Date(page.lastUpdated).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>

          {/* Content Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 px-6 sm:px-8 py-8 mb-12">
            <div
              className="prose prose-slate max-w-none text-slate-800 leading-relaxed [&_font[color]]:!text-[attr(color)] [&_[style*='color']]:![color:inherit]"
              dangerouslySetInnerHTML={{ __html: formatContent(effectiveContent) }}
            />

            {/* Privacy Contact Card appended if page content exists */}
            {slug === 'privacy' && page?.content && (
              <div className="mt-8 pt-6 border-t border-slate-200 bg-slate-50 p-6 rounded-2xl">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Privacy & Data Officer Contact</h3>
                <p className="text-sm text-slate-600 mb-3">For any privacy questions or data requests, contact:</p>
                <div className="space-y-1 text-sm font-medium text-slate-800">
                  <p><strong>Name:</strong> Devesh Lal</p>
                  <p><strong>Mobile:</strong> 9999188143</p>
                  <p><strong>Email:</strong> <a href="mailto:davesh0007@gmail.com" className="text-brand-primary hover:underline">davesh0007@gmail.com</a></p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <PublicPageLayout>{bodyContent}</PublicPageLayout>;
};

export default StaticPage;
