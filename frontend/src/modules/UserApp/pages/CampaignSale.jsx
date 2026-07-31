import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { motion } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import PageTransition from "../../../shared/components/PageTransition";
import api from "../../../shared/utils/api";

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendorId && typeof raw.vendorId === "object" ? raw.vendorId : null;
  const brandObj =
    raw?.brandId && typeof raw.brandId === "object" ? raw.brandId : null;
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    vendorId: vendorObj?._id || raw?.vendorId,
    brandId: brandObj?._id || raw?.brandId,
    categoryId: categoryObj?._id || raw?.categoryId,
    vendorName: raw?.vendorName || vendorObj?.storeName || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : [],
    price: Number(raw?.price) || 0,
    originalPrice:
      raw?.originalPrice !== undefined ? Number(raw.originalPrice) : undefined,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
  };
};

const CampaignSale = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchCampaign = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/campaigns/${slug}`);
        const payload = response?.data ?? response;
        if (cancelled) return;
        setCampaign(payload || null);
        const normalizedProducts = Array.isArray(payload?.products)
          ? payload.products.map(normalizeProduct)
          : [];
        setProducts(normalizedProducts);
      } catch {
        if (!cancelled) {
          setCampaign(null);
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchCampaign();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const title = useMemo(() => campaign?.name || "Special Offer", [campaign]);
  const discount = useMemo(() => {
    if (!campaign) return "";
    if (campaign.discountType === "percentage") {
      return `${campaign.discountValue || 0}% OFF`;
    }
    return `Save ${campaign.discountValue || 0}`;
  }, [campaign]);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24 min-h-screen bg-surface-muted">
          <div className="px-4 py-4 bg-surface border-b border-border sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-surface-muted rounded-full transition-colors"
              >
                <FiArrowLeft className="text-xl text-content-secondary" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-content">{title}</h1>
                <p className="text-xs text-content-muted">
                  {discount}
                  {products.length ? ` • ${products.length} products` : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-4">
            {isLoading ? (
              <div className="text-center py-12 text-content-muted">Loading campaign...</div>
            ) : !campaign ? (
              <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-content mb-2">Campaign unavailable</h3>
                <p className="text-content-muted">This offer is not active right now.</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-content mb-2">No products in this campaign</h3>
                <p className="text-content-muted">Please check back later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {products.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <ProductCard product={product} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default CampaignSale;
