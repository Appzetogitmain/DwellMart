import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiTruck,
  FiRotateCcw,
  FiShield,
  FiCheckCircle,
  FiUsers,
  FiBox,
  FiGrid,
  FiLock,
  FiAward,
  FiGlobe,
  FiTag,
  FiPercent,
  FiHeart,
  FiStar,
  FiClock,
  FiHeadphones,
  FiGift,
  FiDollarSign,
  FiZap,
} from 'react-icons/fi';
import api from '../../../../shared/utils/api';
import { usePageTranslation } from '../../../../hooks/usePageTranslation';

const ICON_COMPONENTS = {
  truck: FiTruck,
  rotate: FiRotateCcw,
  shield: FiShield,
  check: FiCheckCircle,
  users: FiUsers,
  box: FiBox,
  grid: FiGrid,
  lock: FiLock,
  award: FiAward,
  globe: FiGlobe,
  tag: FiTag,
  percent: FiPercent,
  heart: FiHeart,
  star: FiStar,
  clock: FiClock,
  headset: FiHeadphones,
  gift: FiGift,
  dollar: FiDollarSign,
  zap: FiZap,
};

const COLOR_SCHEME_CLASSES = {
  info: 'bg-status-info/10 text-status-info',
  success: 'bg-status-success/10 text-status-success',
  primary: 'bg-brand-primary/10 text-brand-primary',
  warning: 'bg-status-warning/10 text-status-warning',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
};

const DEFAULT_SECTION_DATA = {
  badge: 'MARKETPLACE TRUST & ASSURANCE',
  title: 'Why Shop With Dwell Mart?',
  subtitle: 'We partner with top-rated sellers to guarantee authentic products, transparent pricing, and instant support.',
  isEnabled: true,
  featureCards: [
    {
      id: 'feature-1',
      title: 'Free Express Shipping',
      description: 'On all orders over ₹499 nationwide',
      icon: 'truck',
      colorScheme: 'info',
      isActive: true,
    },
    {
      id: 'feature-2',
      title: '7-Day Easy Returns',
      description: 'Hassle-free 100% money back guarantee',
      icon: 'rotate',
      colorScheme: 'success',
      isActive: true,
    },
    {
      id: 'feature-3',
      title: '100% Secure Payments',
      description: 'Encrypted checkout via UPI, Cards & NetBanking',
      icon: 'shield',
      colorScheme: 'primary',
      isActive: true,
    },
    {
      id: 'feature-4',
      title: 'Verified Marketplace Sellers',
      description: 'Quality-vetted vendors across India',
      icon: 'check',
      colorScheme: 'warning',
      isActive: true,
    },
  ],
  statCards: [
    {
      id: 'stat-1',
      value: '8+',
      label: 'VERIFIED STORES',
      icon: 'users',
      isActive: true,
    },
    {
      id: 'stat-2',
      value: '6+',
      label: 'CURATED PRODUCTS',
      icon: 'box',
      isActive: true,
    },
    {
      id: 'stat-3',
      value: '10+',
      label: 'CATEGORIES',
      icon: 'grid',
      isActive: true,
    },
    {
      id: 'stat-4',
      value: '100%',
      label: 'SECURE PAYMENTS',
      icon: 'lock',
      isActive: true,
    },
  ],
};

const MarketplaceTrustSection = ({ vendorCount = 0, productCount = 0 }) => {
  const [data, setData] = useState(DEFAULT_SECTION_DATA);

  const textStrings = [
    data.badge,
    data.title,
    data.subtitle,
    ...(data.featureCards || []).flatMap((c) => [c.title, c.description]),
    ...(data.statCards || []).map((c) => c.label),
  ].filter(Boolean);

  const { getTranslatedText: t } = usePageTranslation(textStrings);

  useEffect(() => {
    let isMounted = true;
    const loadTrustData = async () => {
      try {
        const res = await api.get('/trust-assurance');
        const remote = res?.data || res;
        if (remote && isMounted) {
          setData({
            badge: remote.badge || DEFAULT_SECTION_DATA.badge,
            title: remote.title || DEFAULT_SECTION_DATA.title,
            subtitle: remote.subtitle || DEFAULT_SECTION_DATA.subtitle,
            isEnabled: remote.isEnabled !== false,
            featureCards: Array.isArray(remote.featureCards) && remote.featureCards.length > 0
              ? remote.featureCards
              : DEFAULT_SECTION_DATA.featureCards,
            statCards: Array.isArray(remote.statCards) && remote.statCards.length > 0
              ? remote.statCards
              : DEFAULT_SECTION_DATA.statCards,
          });
        }
      } catch (err) {
        // Fallback gracefully to default
      }
    };
    loadTrustData();
    return () => {
      isMounted = false;
    };
  }, []);

  if (data.isEnabled === false) {
    return null;
  }

  const activeFeatureCards = (data.featureCards || []).filter((c) => c.isActive !== false);
  const activeStatCards = (data.statCards || []).filter((c) => c.isActive !== false);

  const translateText = (text) => {
    if (!text) return '';
    return t(text);
  };

  return (
    <section className="py-8 sm:py-12 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="max-w-6xl mx-auto bg-surface rounded-3xl sm:rounded-[36px] border border-border p-6 sm:p-10 md:p-12 shadow-xl text-center"
      >
        {/* Top Pill Badge */}
        {data.badge && (
          <div className="inline-block px-4 py-1.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
            {translateText(data.badge)}
          </div>
        )}

        {/* Title */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-content tracking-tight mb-3">
          {translateText(data.title)}
        </h2>

        {/* Subtitle */}
        {data.subtitle && (
          <p className="text-content-secondary text-sm sm:text-base font-medium max-w-2xl mx-auto leading-relaxed mb-8 sm:mb-10">
            {translateText(data.subtitle)}
          </p>
        )}

        {/* White Feature Cards Grid */}
        {activeFeatureCards.length > 0 && (
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              activeFeatureCards.length >= 4 ? 'lg:grid-cols-4' : `lg:grid-cols-${activeFeatureCards.length}`
            } gap-4 mb-6 sm:mb-8 text-left`}
          >
            {activeFeatureCards.map((feature, index) => {
              const IconComp = ICON_COMPONENTS[feature.icon] || FiShield;
              const colorClass = COLOR_SCHEME_CLASSES[feature.colorScheme] || COLOR_SCHEME_CLASSES.info;

              return (
                <div
                  key={feature.id || index}
                  className="bg-surface-muted border border-border rounded-2xl p-5 flex items-start gap-4 hover:shadow-md transition-all duration-300"
                >
                  <div
                    className={`h-12 w-12 rounded-2xl ${colorClass} flex items-center justify-center shrink-0`}
                  >
                    <IconComp className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-content leading-tight mb-1">
                      {translateText(feature.title)}
                    </h3>
                    {feature.description && (
                      <p className="text-xs text-content-secondary font-medium leading-relaxed">
                        {translateText(feature.description)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dark Stat Cards Grid */}
        {activeStatCards.length > 0 && (
          <div
            className={`grid grid-cols-2 ${
              activeStatCards.length >= 4 ? 'lg:grid-cols-4' : `lg:grid-cols-${activeStatCards.length}`
            } gap-4`}
          >
            {activeStatCards.map((stat, index) => {
              const IconComp = ICON_COMPONENTS[stat.icon] || FiStar;
              let displayValue = stat.value;

              // If value contains dynamic placeholders, resolve them gracefully
              if (stat.value === 'auto_vendors' || (index === 0 && stat.value === '8+' && vendorCount > 0)) {
                displayValue = `${vendorCount}+`;
              } else if (stat.value === 'auto_products' || (index === 1 && stat.value === '6+' && productCount > 0)) {
                displayValue = `${productCount}+`;
              }

              return (
                <div
                  key={stat.id || index}
                  className="bg-surface-header rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:-translate-y-1 border border-border"
                >
                  <IconComp className="text-brand-primary text-2xl sm:text-3xl mb-3" />
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary tracking-tight mb-1">
                    {displayValue}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-content-secondary tracking-wider uppercase">
                    {translateText(stat.label)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </section>
  );
};

export default MarketplaceTrustSection;
