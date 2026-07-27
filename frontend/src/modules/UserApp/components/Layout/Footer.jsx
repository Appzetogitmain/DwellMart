import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiFacebook,
  FiTwitter,
  FiInstagram,
  FiYoutube,
  FiChevronRight
} from "react-icons/fi";
import { motion } from "framer-motion";
import { loginLogo } from "../../../../shared/utils/imagePaths";
import api from "../../../../shared/utils/api";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../../hooks/useDynamicTranslation";

import { useSettingsStore } from "../../../../shared/store/settingsStore";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [categories, setCategories] = useState([]);
  const { settings, initialize } = useSettingsStore();
  const { translateObject } = useDynamicTranslation();
  const { getTranslatedText: t } = usePageTranslation([
    "Your one-stop destination for curated products from trusted vendors nationwide. We prioritize quality, security, and customer delight in every transaction.",
    "Shop Categories",
    "Customer Service",
    "Quick Links",
    "Contact Us",
    "Track Your Order",
    "Returns & Exchanges",
    "Shipping Policy",
    "FAQs",
    "About Dwell Mart",
    "Vendor Registration",
    "Terms & Conditions",
    "Privacy Policy",
    "Become a Partner",
    "All rights reserved."
  ]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const general = settings?.general || {};
  const logo = general.storeLogo || loginLogo;
  const description = general.storeDescription || "Your one-stop destination for curated products from trusted vendors nationwide. We prioritize quality, security, and customer delight in every transaction.";
  const name = general.storeName || "Dwell Mart";
  const social = general.socialMedia || {};

  useEffect(() => {
    api.get("/categories/all")
      .then(async (res) => {
        const data = res.data?.data || res.data || [];
        // Sort by order field, take first 5 active ones
        const sorted = data
          .filter((c) => c.isActive !== false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .slice(0, 5);
        
        // Translate category names
        const translated = await Promise.all(
          sorted.map(cat => translateObject(cat, ['name']))
        );
        setCategories(translated);
      })
      .catch(() => {
        // Silently fail — footer still renders without categories
      });
  }, [translateObject]);

  const customerServiceLinks = [
    { label: "Contact Us", path: "/contact" },
    { label: "Track Your Order", path: "/orders" },
    { label: "Returns & Exchanges", path: "/returns" },
    { label: "Shipping Policy", path: "/shipping" },
    { label: "FAQs", path: "/faq" },
  ];

  const quickLinks = [
    { label: "About Dwell Mart", path: "/about" },
    { label: "Vendor Registration", path: "/sell-on-dwellmart" },
    { label: "Terms & Conditions", path: "/terms" },
    { label: "Privacy Policy", path: "/privacy" },
    { label: "Become a Partner", path: "/partner" },
  ];

  const socialItems = [
    { icon: FiFacebook, link: social.facebook || "#" },
    { icon: FiTwitter, link: social.twitter || "#" },
    { icon: FiInstagram, link: social.instagram || "#" },
    { icon: FiYoutube, link: social.linkedin || "#" },
  ].filter(s => s.link && s.link !== "#");

  const displaySocials = socialItems.length > 0 ? socialItems : [
    { icon: FiFacebook, link: "#" },
    { icon: FiTwitter, link: "#" },
    { icon: FiInstagram, link: "#" },
    { icon: FiYoutube, link: "#" },
  ];

  return (
    <footer className="bg-gray-900 text-gray-300 pt-16 pb-8 border-t border-gray-800">
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand Identity */}
          <div className="space-y-4">
            <Link to="/home" className="inline-block">
              <img src={logo} alt={`${name} Logo`} className="h-14 sm:h-16 md:h-20 w-auto object-contain drop-shadow-md" />
            </Link>
            <p className="text-sm leading-relaxed text-gray-400">
              {t(description)}
            </p>
            <div className="flex items-center gap-4">
              {displaySocials.map((social, i) => (
                <motion.a
                  key={i}
                  href={social.link}
                  target={social.link !== "#" ? "_blank" : undefined}
                  rel={social.link !== "#" ? "noopener noreferrer" : undefined}
                  whileHover={{ y: -5, color: "#7C3AED" }}
                  className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center transition-colors"
                >
                  <social.icon className="text-lg" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Shop Categories — dynamic from DB */}
          <div className="space-y-6">
            <h4 className="text-white font-bold tracking-wide uppercase text-sm">{t("Shop Categories")}</h4>
            <ul className="space-y-4">
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <li key={cat._id}>
                    <Link
                      to={`/category/${cat._id}`}
                      className="group flex items-center gap-2 text-gray-400 hover:text-primary-400 transition-colors"
                    >
                      <FiChevronRight className="text-xs opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                      {cat.name}
                    </Link>
                  </li>
                ))
              ) : (
                // Skeleton placeholders while loading
                [...Array(5)].map((_, i) => (
                  <li key={i}>
                    <div className="h-4 bg-gray-700 rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Customer Service */}
          <div className="space-y-6">
            <h4 className="text-white font-bold tracking-wide uppercase text-sm">{t("Customer Service")}</h4>
            <ul className="space-y-4">
              {customerServiceLinks.map((link, i) => (
                <li key={i}>
                  <Link
                    to={link.path}
                    className="group flex items-center gap-2 text-gray-400 hover:text-primary-400 transition-colors"
                  >
                    <FiChevronRight className="text-xs opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
            <h4 className="text-white font-bold tracking-wide uppercase text-sm">{t("Quick Links")}</h4>
            <ul className="space-y-4">
              {quickLinks.map((link, i) => (
                <li key={i}>
                  <Link
                    to={link.path}
                    className="group flex items-center gap-2 text-gray-400 hover:text-primary-400 transition-colors"
                  >
                    <FiChevronRight className="text-xs opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mt-8 pt-8 border-t border-gray-800">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} <span className="text-white font-semibold">Dwell Mart</span>. {t("All rights reserved.")}
          </p>
          <div className="flex items-center gap-4 opacity-50">
            <img src="https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@master/flat/visa.svg" alt="Visa" className="h-5" />
            <img src="https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@master/flat/mastercard.svg" alt="Mastercard" className="h-7" />
            <img src="https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@master/flat/paypal.svg" alt="PayPal" className="h-5" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
