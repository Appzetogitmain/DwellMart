import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiClock, FiZap } from "react-icons/fi";
import ProductGrid from "../../../../shared/components/ProductGrid";
import { getDailyDeals } from "../../data/catalogData";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { Button, Badge } from "../../../../shared/components/ui";

const DailyDealsSection = ({ products = null }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Daily Deals",
    "Limited time offers - Up to 70% OFF",
    "See All",
    "Deal ends in",
    "Hrs",
    "Min",
    "Sec"
  ]);
  const fallback = getDailyDeals().slice(0, 6);
  const dailyDeals = Array.isArray(products) && products.length > 0
    ? products.slice(0, 6)
    : fallback;
  const [timeLeft, setTimeLeft] = useState({
    hours: 23,
    minutes: 59,
    seconds: 59,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const difference = endOfDay - now;

      if (difference > 0) {
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / (1000 * 60)) % 60);
        const seconds = Math.floor((difference / 1000) % 60);

        setTimeLeft({ hours, minutes, seconds });
      } else {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, []);

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
              {t("Daily Deals")}
            </h2>
            <Badge variant="gold">
              <FiZap className="mr-1 inline" /> 70% OFF
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-textColor-muted font-medium line-clamp-1">
            {t("Limited time offers - Up to 70% OFF")}
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
        <div className="flex items-center gap-3 bg-surface-card p-3 rounded-card border border-borderToken-default shadow-sm">
          <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center font-bold">
            <FiClock />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-textColor-muted">{t("Deal ends in")}:</span>
            <div className="flex items-center gap-1.5 font-black text-xs text-textColor-primary">
              <span className="bg-surface-background px-2 py-1 rounded-btn border border-borderToken-default">{formatTime(timeLeft.hours)} {t("Hrs")}</span>
              <span>:</span>
              <span className="bg-surface-background px-2 py-1 rounded-btn border border-borderToken-default">{formatTime(timeLeft.minutes)} {t("Min")}</span>
              <span>:</span>
              <span className="bg-brand-primary text-textColor-brand px-2 py-1 rounded-btn">{formatTime(timeLeft.seconds)} {t("Sec")}</span>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <ProductGrid products={dailyDeals} variant="default" />
      </div>
    </div>
  );
};

export default DailyDealsSection;
