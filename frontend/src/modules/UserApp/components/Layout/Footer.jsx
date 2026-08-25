import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiFacebook,
  FiTwitter,
  FiInstagram,
  FiYoutube,
  FiChevronRight,
  FiChevronDown
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { loginLogo } from "../../../../shared/utils/imagePaths";
import api from "../../../../shared/utils/api";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../../hooks/useDynamicTranslation";
import { useSettingsStore } from "../../../../shared/store/settingsStore";

const DEFAULT_FOOTER_CATEGORIES = [
  { _id: "fashion", name: "Fashion & Apparel" },
  { _id: "electronics", name: "Electronics & Gadgets" },
  { _id: "home", name: "Home & Furniture" },
  { _id: "beauty", name: "Beauty & Personal Care" },
  { _id: "groceries", name: "Groceries & Essentials" },
  { _id: "footwear", name: "Footwear & Accessories" },
];

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [categories, setCategories] = useState([]);
  const [openSection, setOpenSection] = useState(null); // Track open accordion on mobile ('categories', 'service', 'links')
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
    let active = true;
    api.get("/categories/all")
      .then((res) => {
        const data = res.data?.data || res.data || [];
        const sorted = data
          .filter((c) => c.isActive !== false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .slice(0, 6);

        if (!active) return;
        setCategories(sorted);

        // Async translate in background without blocking initial render
        if (sorted.length > 0) {
          Promise.all(sorted.map(cat => translateObject(cat, ['name'])))
            .then(translated => {
              if (active) setCategories(translated);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        // Silently fail
      });
    return () => { active = false; };
  }, []); // Run once on mount

  const displayCategories = categories.length > 0 ? categories : DEFAULT_FOOTER_CATEGORIES;

  const customerServiceLinks = [
    { label: "Contact Us", path: "/contact" },
    { label: "Submit Feedback", path: "/feedback" },
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

  const toggleSection = (sectionKey) => {
    setOpenSection((prev) => (prev === sectionKey ? null : sectionKey));
  };

  return (
    <footer className="bg-gradient-to-b from-[#0F172A] via-[#090D16] to-[#05070D] text-gray-300 pt-10 sm:pt-14 pb-28 sm:pb-12 border-t border-gray-800/80">
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-12 mb-8 sm:mb-12">
          
          {/* Brand Identity */}
          <div className="space-y-4">
            <div>
              <Link to="/home" className="inline-block mb-3">
                <img src={logo} alt={`${name} Logo`} className="h-10 sm:h-14 w-auto object-contain drop-shadow-md" />
              </Link>
              <p className="text-xs sm:text-sm leading-relaxed text-gray-400">
                {t(description)}
              </p>
            </div>
            
            {/* Social Icons Bar */}
            <div className="pt-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Connect With Us
              </span>
              <div className="flex items-center gap-2.5">
                {displaySocials.map((sItem, i) => (
                  <motion.a
                    key={i}
                    href={sItem.link}
                    target={sItem.link !== "#" ? "_blank" : undefined}
                    rel={sItem.link !== "#" ? "noopener noreferrer" : undefined}
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-9 h-9 rounded-full bg-gray-800/80 hover:bg-amber-400 hover:text-gray-900 hover:border-amber-400 border border-gray-700 flex items-center justify-center transition-all duration-300 text-gray-300"
                  >
                    <sItem.icon className="text-base" />
                  </motion.a>
                ))}
              </div>
            </div>
          </div>

          {/* Shop Categories */}
          <div className="border-b sm:border-0 border-gray-800/60 pb-3 sm:pb-0">
            {/* Mobile Accordion Header */}
            <button
              onClick={() => toggleSection("categories")}
              className="w-full flex items-center justify-between sm:cursor-default text-left py-2 sm:py-0 focus:outline-none"
            >
              <h4 className="text-white font-bold tracking-wider uppercase text-xs sm:text-sm">
                {t("Shop Categories")}
              </h4>
              <FiChevronDown
                className={`text-gray-400 text-lg transition-transform duration-300 sm:hidden ${
                  openSection === "categories" ? "rotate-180 text-amber-400" : ""
                }`}
              />
            </button>

            {/* Links List (Always visible on Desktop, collapsible on Mobile) */}
            <div className={`mt-3 space-y-2 sm:block ${openSection === "categories" ? "block" : "hidden sm:block"}`}>
              <ul className="space-y-2">
                {displayCategories.map((cat, i) => (
                  <li key={cat._id || i}>
                    <Link
                      to={cat._id && cat._id !== cat.name.toLowerCase() ? `/category/${cat._id}` : "/search"}
                      className="group flex items-center gap-2 text-xs sm:text-sm text-gray-400 hover:text-amber-400 transition-colors py-0.5"
                    >
                      <FiChevronRight className="text-xs opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all text-amber-400" />
                      <span>{t(cat.name)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Customer Service */}
          <div className="border-b sm:border-0 border-gray-800/60 pb-3 sm:pb-0">
            {/* Mobile Accordion Header */}
            <button
              onClick={() => toggleSection("service")}
              className="w-full flex items-center justify-between sm:cursor-default text-left py-2 sm:py-0 focus:outline-none"
            >
              <h4 className="text-white font-bold tracking-wider uppercase text-xs sm:text-sm">
                {t("Customer Service")}
              </h4>
              <FiChevronDown
                className={`text-gray-400 text-lg transition-transform duration-300 sm:hidden ${
                  openSection === "service" ? "rotate-180 text-amber-400" : ""
                }`}
              />
            </button>

            {/* Links List */}
            <div className={`mt-3 space-y-2 sm:block ${openSection === "service" ? "block" : "hidden sm:block"}`}>
              <ul className="space-y-2">
                {customerServiceLinks.map((link, i) => (
                  <li key={i}>
                    <Link
                      to={link.path}
                      className="group flex items-center gap-2 text-xs sm:text-sm text-gray-400 hover:text-amber-400 transition-colors py-0.5"
                    >
                      <FiChevronRight className="text-xs opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all text-amber-400" />
                      <span>{t(link.label)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Quick Links */}
          <div className="border-b sm:border-0 border-gray-800/60 pb-3 sm:pb-0">
            {/* Mobile Accordion Header */}
            <button
              onClick={() => toggleSection("links")}
              className="w-full flex items-center justify-between sm:cursor-default text-left py-2 sm:py-0 focus:outline-none"
            >
              <h4 className="text-white font-bold tracking-wider uppercase text-xs sm:text-sm">
                {t("Quick Links")}
              </h4>
              <FiChevronDown
                className={`text-gray-400 text-lg transition-transform duration-300 sm:hidden ${
                  openSection === "links" ? "rotate-180 text-amber-400" : ""
                }`}
              />
            </button>

            {/* Links List */}
            <div className={`mt-3 space-y-2 sm:block ${openSection === "links" ? "block" : "hidden sm:block"}`}>
              <ul className="space-y-2">
                {quickLinks.map((link, i) => (
                  <li key={i}>
                    <Link
                      to={link.path}
                      className="group flex items-center gap-2 text-xs sm:text-sm text-gray-400 hover:text-amber-400 transition-colors py-0.5"
                    >
                      <FiChevronRight className="text-xs opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all text-amber-400" />
                      <span>{t(link.label)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Copyright & Payment Methods */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-800/80">
          <p className="text-xs text-gray-500 text-center sm:text-left font-medium">
            &copy; {currentYear} <span className="text-white font-bold">Dwell Mart</span>. {t("All rights reserved.")}
          </p>
          <div className="flex items-center gap-3 opacity-70">
            <img src="https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@master/flat/visa.svg" alt="Visa" className="h-4 sm:h-5" />
            <img src="https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@master/flat/mastercard.svg" alt="Mastercard" className="h-6 sm:h-7" />
            <img src="https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@master/flat/paypal.svg" alt="PayPal" className="h-4 sm:h-5" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
