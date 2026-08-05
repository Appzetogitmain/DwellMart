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
  } else if (notFound || (!isLoading && !page)) {
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
  } else if (!page.content) {
    bodyContent = (
      <div className="py-16 px-4 flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <p className="text-6xl">📝</p>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-gray-500 max-w-sm">This page is coming soon. We're working on it!</p>
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
            {page.lastUpdated && (
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
              dangerouslySetInnerHTML={{ __html: formatContent(page.content) }}
            />
          </div>
        </div>
      </div>
    );
  }

  return <PublicPageLayout>{bodyContent}</PublicPageLayout>;
};

export default StaticPage;
