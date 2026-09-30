import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiClock, FiZap } from "react-icons/fi";
import ProductGrid from "../../../../shared/components/ProductGrid";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { Button, Badge } from "../../../../shared/components/ui";

const DailyDealsSection = ({ products = [], title = "Daily Deals", subtitle = "Limited time offers" }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Daily Deals",
    "Limited time offers",
    "Today's offers",
    "See All",
    "Deal ends in",
    "Hrs",
    "Min",
    "Sec"
  ]);
  const dailyDeals = Array.isArray(products) ? products.slice(0, 6) : [];
  const endTimes = dailyDeals
    .map((product) => new Date(product.dealEndsAt).getTime())
    .filter((value) => Number.isFinite(value) && value > Date.now());
  const endAtMs = endTimes.length ? Math.min(...endTimes) : null;
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      setTimeLeft(endAtMs ? Math.max(0, Math.floor((endAtMs - Date.now()) / 1000)) : 0);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [endAtMs]);

  const formatTime = (value) => {
    return value.toString().padStart(2, "0");
  };

  if (dailyDeals.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-4">
      {/* Section Header */}
      <div className="flex items-end justify-between gap-4 border-b border-borderToken-default pb-3 sm:pb-4 mb-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-textColor-primary tracking-tight truncate">
              {t(title)}
            </h2>
            <Badge variant="gold">
              <FiZap className="mr-1 inline" /> {t("Today's offers")}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-textColor-muted font-medium line-clamp-1">
            {t(subtitle)}
          </p>
        </div>

        <div className="flex-shrink-0">
          <Button as={Link} to="/daily-deals" variant="outline" size="sm">
            {t("See All")}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Countdown Timer Bar */}
        {endAtMs && timeLeft > 0 && <div className="flex items-center gap-3 bg-surface-card p-3 rounded-card border border-borderToken-default shadow-sm">
          <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center font-bold">
            <FiClock />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-textColor-muted">{t("Deal ends in")}:</span>
            <div className="flex items-center gap-1.5 font-black text-xs text-textColor-primary">
              <span className="bg-surface-background px-2 py-1 rounded-btn border border-borderToken-default">{formatTime(Math.floor(timeLeft / 3600))} {t("Hrs")}</span>
              <span>:</span>
              <span className="bg-surface-background px-2 py-1 rounded-btn border border-borderToken-default">{formatTime(Math.floor((timeLeft % 3600) / 60))} {t("Min")}</span>
              <span>:</span>
              <span className="bg-brand-primary text-textColor-brand px-2 py-1 rounded-btn">{formatTime(timeLeft % 60)} {t("Sec")}</span>
            </div>
          </div>
        </div>}

        {/* Product Grid */}
        <ProductGrid products={dailyDeals} variant="default" />
      </div>
    </div>
  );
};

export default DailyDealsSection;
