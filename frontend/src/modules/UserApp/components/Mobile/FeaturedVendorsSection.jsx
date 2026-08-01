import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import VendorShowcaseCard from './VendorShowcaseCard';
import { getApprovedVendors } from '../../data/catalogData';
import { usePageTranslation } from '../../../../hooks/usePageTranslation';

const FeaturedVendorsSection = ({ vendors = null }) => {
  const { getTranslatedText: t } = usePageTranslation(["Best Sellers", "Shop from top-rated verified stores", "See All"]);
  const approvedVendors = Array.isArray(vendors) && vendors.length > 0
    ? vendors
    : getApprovedVendors();
  const featuredVendors = approvedVendors
    .slice(0, 10);

  if (featuredVendors.length === 0) return null;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-content">{t("Best Sellers")}</h2>
          <p className="text-xs text-content-secondary mt-0.5">{t("Shop from top-rated verified stores")}</p>
        </div>
        <Link
          to="/sellers"
          className="flex items-center gap-1 text-sm text-brand-primary font-semibold hover:underline transition-colors"
        >
          <span>{t("See All")}</span>
          <FiArrowRight className="text-sm" />
        </Link>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
        {featuredVendors.map((vendor, index) => (
          <VendorShowcaseCard key={vendor.id || vendor._id || index} vendor={vendor} index={index} />
        ))}
      </div>
    </div>
  );
};

export default FeaturedVendorsSection;

