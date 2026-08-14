import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiZap } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import ExpressCategoryBrowser from "../components/QuickCommerce/ExpressCategoryBrowser";
import { getPublicCategories } from "../../Admin/services/adminService";

const QuickCommerceCategoriesPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCategoryParam = searchParams.get("category");

  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQcCats = async () => {
      setIsLoading(true);
      try {
        const response = await getPublicCategories("quick_commerce");
        setCategories(response.data || []);
      } catch (err) {
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQcCats();
  }, []);

  return (
    <PageTransition>
      <MobileLayout showBottomNav showCartBar>
        <div className="w-full max-w-7xl mx-auto bg-surface-muted pb-2">
          {/* Header */}
          <header className="sticky top-0 z-30 bg-surface border-b border-border p-3 sm:p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/quick")}
                className="p-2 rounded-full hover:bg-surface-muted transition-colors cursor-pointer"
                aria-label="Back to Express Home"
              >
                <FiArrowLeft className="text-xl text-content-secondary" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                  <FiZap className="text-amber-500 fill-amber-500 text-sm" />
                </div>
                <div>
                  <h1 className="text-base font-black text-content tracking-tight">
                    Express Category Explorer
                  </h1>
                  <p className="text-[11px] text-content-muted font-medium">
                    10-15 Min Delivery Essentials
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Dedicated Category Explorer — Embedded ExpressCategoryBrowser */}
          <div className="pt-1">
            <ExpressCategoryBrowser
              categories={categories}
              isLoadingCategories={isLoading}
              initialCategoryId={initialCategoryParam}
            />
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default QuickCommerceCategoriesPage;
