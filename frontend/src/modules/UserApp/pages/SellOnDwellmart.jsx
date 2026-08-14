import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheck,
  FiZap,
  FiShoppingBag,
  FiShield,
  FiTrendingUp,
  FiDollarSign,
  FiUsers,
  FiBox,
  FiTruck,
  FiCheckCircle,
  FiArrowRight,
  FiPlay,
  FiPackage,
  FiLayers,
  FiActivity,
} from 'react-icons/fi';
import DesktopHeader from '../components/Layout/DesktopHeader';
import MobileHeader from '../components/Layout/MobileHeader';
import Footer from '../components/Layout/Footer';
import SubscriptionOnboardingWizard from '../../Vendor/components/SubscriptionOnboardingWizard';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { Button, Badge } from '../../../shared/components/ui';

const SellOnDwellmart = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Become a Dwell Mart Seller',
    'Start Selling on Dwell Mart',
    'Launch your online business across Marketplace, Quick Commerce, and Wholesale from one dashboard.',
    'Start Selling',
    'Watch Demo',
    'Secure Payments',
    'PAN & GST Verification',
    'Fast Vendor Approval',
    'Trusted by Hundreds of Sellers',
    'Active Vendors',
    'Products Sold',
    'Cities Covered',
    'On-Time Express Deliveries',
    'Selling Channels',
    'Marketplace (B2C)',
    'Quick Commerce (10–30 Min)',
    'Wholesale (B2B)',
    'How It Works',
    'Start your vendor onboarding',
    'Select your plan below to open the secure registration and billing workflow.',
  ]);

  // Demo Modal State
  const [showDemoModal, setShowDemoModal] = useState(false);

  const scrollToWizard = () => {
    const el = document.getElementById('onboarding-wizard-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Trust Statistics
  const stats = [
    { number: '500+', label: t('Active Vendors'), icon: FiUsers, highlight: 'Verified' },
    { number: '100K+', label: t('Products Sold'), icon: FiPackage, highlight: 'Nationwide' },
    { number: '50+', label: t('Cities Covered'), icon: FiTruck, highlight: 'Express Hubs' },
    { number: '99.9%', label: t('On-Time Express Deliveries'), icon: FiShield, highlight: 'SLA Guaranteed' },
  ];

  // Selling Channels
  const channels = [
    {
      title: 'Marketplace (B2C)',
      badge: 'Retail Channel',
      description: 'Sell directly to millions of retail shoppers nationwide with integrated logistics and automated tracking.',
      features: ['Nationwide Reach across 50+ Cities', 'Automated Shipping & Airway Bills', '7-Day Instant Return Processing', 'Verified Customer Ratings'],
      icon: FiShoppingBag,
      gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
      borderColor: 'border-amber-400/30',
      badgeColor: 'gold',
    },
    {
      title: 'Quick Commerce (10–30 Min)',
      badge: 'Express Hub',
      description: 'Fulfill hyperlocal orders in 10-30 minutes through our dedicated rider dispatch network.',
      features: ['10-15 Minute Hyperlocal Delivery', 'Automated Rider Dispatch Queue', 'Zero Packing & Prep Delays', 'High Daily Order Velocity'],
      icon: FiZap,
      gradient: 'from-[#D4AF37]/15 via-amber-400/5 to-transparent',
      borderColor: 'border-[#D4AF37]/40',
      badgeColor: 'warning',
    },
    {
      title: 'Wholesale (B2B)',
      badge: 'Bulk B2B Orders',
      description: 'Supply retail stores and businesses in bulk with custom GST invoicing and tiered quantity pricing.',
      features: ['Tiered Volume Discounts', 'Automated B2B GST Tax Invoices', 'Verified Corporate Buyers', 'Recurring Bulk Purchase Orders'],
      icon: FiLayers,
      gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
      borderColor: 'border-emerald-400/30',
      badgeColor: 'success',
    },
  ];

  // Timeline steps
  const journeySteps = [
    { step: '01', title: 'Choose Plan', desc: 'Select Trial, Monthly, Quarterly, or Pro membership.', icon: FiBox },
    { step: '02', title: 'Register', desc: 'Fill in store profile, owner details, and credentials.', icon: FiUsers },
    { step: '03', title: 'Verification', desc: 'Upload GST or Trade License for instant 24h approval.', icon: FiCheckCircle },
    { step: '04', title: 'Payment & Activation', desc: 'Secure checkout via Cashfree PG (UPI, Cards, NetBanking).', icon: FiDollarSign },
    { step: '05', title: 'Go Live', desc: 'Upload catalog, manage stock, and receive payouts.', icon: FiTrendingUp },
  ];

  // Feature Matrix Comparison Table
  const comparisonPlans = [
    { name: '15 Days Trial', price: 'Free', limit: '10 Products', marketplace: true, wholesale: false, quickCommerce: false, analytics: 'Basic', support: 'Email' },
    { name: 'Monthly Plan', price: '₹1,000 / $10', limit: '100 Products', marketplace: true, wholesale: true, quickCommerce: true, analytics: 'Standard', support: 'Priority Email' },
    { name: 'Quarterly Plan', price: '₹2,000 / $20', limit: '500 Products', marketplace: true, wholesale: true, quickCommerce: true, analytics: 'Advanced', support: 'Phone & Chat' },
    { name: 'Half-Yearly', price: '₹4,000 / $40', limit: '1,500 Products', marketplace: true, wholesale: true, quickCommerce: true, analytics: 'Advanced', support: 'Dedicated Agent' },
    { name: 'Yearly Plan', price: '₹8,000 / $80', limit: 'Unlimited', marketplace: true, wholesale: true, quickCommerce: true, analytics: 'Pro Suite', support: '24/7 VIP Support', isPopular: true },
    { name: 'Pro Plan', price: '₹10,000 / $100', limit: 'Unlimited', marketplace: true, wholesale: true, quickCommerce: true, analytics: 'Enterprise', support: 'Account Manager' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-[#ffc101]/30 selection:text-black pb-16 md:pb-0">
      {/* ── Desktop & Mobile Headers ── */}
      <DesktopHeader />
      <MobileHeader />

      {/* ── PHASE 1: Premium SaaS Hero Section ── */}
      <section className="relative overflow-hidden bg-slate-900 pt-16 pb-20 text-white lg:pt-24 lg:pb-28">
        {/* Subtle Ambient Glow */}
        <div className="pointer-events-none absolute -top-40 right-10 h-96 w-96 rounded-full bg-[#D4AF37]/10 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-amber-500/10 blur-[90px]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-12">
            {/* Left Column Content */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="lg:col-span-7 space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                <FiZap className="text-amber-400 text-xs" />
                <span>Multi-Channel Merchant Platform</span>
              </div>

              <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.15]">
                Grow your retail & express business on <span className="text-[#ffc101]">Dwell Mart</span>
              </h1>

              <p className="text-base text-slate-300 sm:text-lg max-w-2xl leading-relaxed">
                One unified portal to list products, manage inventory, and fulfill orders across <strong className="text-white">Retail Marketplace</strong>, <strong className="text-amber-400">10-Minute Express</strong>, and <strong className="text-white">B2B Wholesale</strong>.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={scrollToWizard}
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#ffc101] px-7 py-3.5 text-base font-extrabold text-black shadow-lg shadow-amber-500/25 transition-all duration-200 hover:bg-[#ffd042] hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer border-0 whitespace-nowrap group"
                >
                  <span>Start Selling Now</span>
                  <FiArrowRight className="text-lg transition-transform group-hover:translate-x-1 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowDemoModal(true)}
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3.5 text-base font-bold text-slate-200 transition-all duration-200 hover:bg-slate-700 hover:text-white hover:border-slate-600 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer whitespace-nowrap"
                >
                  <FiPlay className="text-amber-400 fill-amber-400 text-xs shrink-0" />
                  <span>Watch Demo</span>
                </button>
              </div>

              {/* Trust Strip */}
              <div className="flex flex-wrap items-center gap-6 border-t border-slate-800/80 pt-6 text-xs text-slate-400 font-semibold">
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="text-[#ffc101]" />
                  <span>24h Seller Approval</span>
                </div>
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="text-[#ffc101]" />
                  <span>Fast Bank Payouts</span>
                </div>
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="text-[#ffc101]" />
                  <span>GST & PAN Verified</span>
                </div>
              </div>
            </motion.div>

            {/* Right Column: Clean SaaS Seller Dashboard Showcase */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="lg:col-span-5"
            >
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
                {/* Window Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 text-[11px] font-mono text-slate-500">seller.dwellmart.com</span>
                  </div>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">Seller Portal</span>
                </div>

                {/* Dashboard Inner Metrics */}
                <div className="mt-4 space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Today's Revenue</p>
                      <p className="mt-1 text-2xl font-extrabold text-amber-400">₹4,85,200</p>
                      <span className="text-[10px] text-emerald-400 font-bold">↑ +28.4% vs yesterday</span>
                    </div>

                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Orders Today</p>
                      <p className="mt-1 text-2xl font-extrabold text-white">389</p>
                      <span className="text-[10px] text-slate-400 font-medium">142 Express Deliveries</span>
                    </div>
                  </div>

                  {/* Weekly Sales Chart Bars */}
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <FiActivity className="text-amber-400" /> Weekly GMV Growth
                      </span>
                      <span className="text-[10px] text-slate-500">7 Days</span>
                    </div>
                    <div className="flex items-end gap-2 h-16 pt-2 justify-between px-1">
                      <div className="w-full bg-slate-800 rounded-t h-[40%]" title="Mon" />
                      <div className="w-full bg-slate-800 rounded-t h-[55%]" title="Tue" />
                      <div className="w-full bg-slate-800 rounded-t h-[45%]" title="Wed" />
                      <div className="w-full bg-slate-800 rounded-t h-[75%]" title="Thu" />
                      <div className="w-full bg-[#ffc101] rounded-t h-[95%]" title="Fri (Peak)" />
                      <div className="w-full bg-[#ffc101]/80 rounded-t h-[70%]" title="Sat" />
                      <div className="w-full bg-[#ffc101]/80 rounded-t h-[80%]" title="Sun" />
                    </div>
                  </div>

                  {/* Settlement Status Banner */}
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <div>
                        <p className="font-semibold text-emerald-300">Automated Daily Settlement</p>
                        <p className="text-[10px] text-emerald-400/70">₹1,48,250 transferred to bank account</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Active</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── PHASE 2: Animated Trust Metrics Section ── */}
      <section className="relative z-10 -mt-12 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 hover:border-[#D4AF37]/60 hover:shadow-2xl transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600">
                      {stat.highlight}
                    </span>
                    <p className="mt-1 text-3xl sm:text-4xl font-black text-slate-900 group-hover:text-amber-600 transition-colors">
                      {stat.number}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {stat.label}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 group-hover:bg-[#D4AF37] group-hover:text-black transition-colors shadow-sm">
                    <Icon className="text-2xl" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── PHASE 3: Glassmorphism Selling Channels ── */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="gold" size="md">3 POWERFUL CHANNELS</Badge>
            <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
              One Dashboard. Three High-Margin Channels.
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Maximize revenue by selling to retail customers nationwide, 10-minute quick commerce buyers, and bulk B2B wholesale clients simultaneously.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {channels.map((channel, idx) => {
              const Icon = channel.icon;
              return (
                <motion.div
                  key={channel.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.15 }}
                  className={`group relative overflow-hidden rounded-3xl border-2 bg-white p-8 shadow-xl hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between ${channel.borderColor}`}
                >
                  <div className={`absolute top-0 right-0 h-44 w-44 rounded-full bg-gradient-to-br ${channel.gradient} blur-2xl group-hover:scale-125 transition-transform`} />

                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-[#ffc101] shadow-md group-hover:bg-[#ffc101] group-hover:text-black transition-colors">
                        <Icon className="text-2xl" />
                      </div>
                      <Badge variant={channel.badgeColor} size="sm">{channel.badge}</Badge>
                    </div>

                    <h3 className="mt-6 text-2xl font-bold text-slate-900">
                      {channel.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {channel.description}
                    </p>

                    <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
                      {channel.features.map((feat) => (
                        <li key={feat} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <FiCheck className="text-amber-500 font-bold text-base shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8 pt-4">
                    <button
                      type="button"
                      onClick={scrollToWizard}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-extrabold text-white shadow-md transition-all duration-200 hover:bg-[#ffc101] hover:text-black hover:shadow-lg hover:shadow-amber-500/20 active:scale-[0.99] cursor-pointer border-0 group/btn"
                    >
                      <span className="truncate">Get Started with {channel.badge}</span>
                      <FiArrowRight className="text-base transition-transform group-hover/btn:translate-x-1 shrink-0" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PHASE 4: Registration Journey Connected Timeline ── */}
      <section className="py-24 bg-white border-y border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="gold" size="md">5-STEP JOURNEY</Badge>
            <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
              Start Selling in Under 10 Minutes
            </h2>
            <p className="mt-3 text-base text-slate-600">
              Our transparent onboarding journey gets your business ready for sales without long paperwork.
            </p>
          </div>

          {/* Connected Timeline */}
          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-5 relative">
            {journeySteps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.1 }}
                  className="relative flex flex-col items-center text-center group"
                >
                  <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-50 text-slate-900 group-hover:bg-[#ffc101] group-hover:text-black transition-colors shadow-md">
                    <Icon className="text-2xl" />
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-extrabold text-white">
                      {step.step}
                    </span>
                  </div>

                  <h3 className="mt-5 text-lg font-extrabold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed px-2 font-medium">
                    {step.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PHASE 5 & ONBOARDING WIZARD ── */}
      <section id="onboarding-wizard-section" className="py-12 sm:py-16 md:py-24 bg-slate-100/70 overflow-hidden">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <SubscriptionOnboardingWizard
            emailStorageKey="vendor-onboarding-email:/sell-on-dwellmart"
            returnTo="/sell-on-dwellmart"
            title={t('Start your vendor onboarding')}
            subtitle={t('Select your plan below to open the secure registration and billing workflow.')}
          />
        </div>
      </section>

      {/* ── Demo Video Modal ── */}
      <AnimatePresence>
        {showDemoModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-3xl rounded-3xl bg-slate-900 p-6 text-white border border-slate-700 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-lg font-extrabold text-amber-400">Dwell Mart Seller Onboarding Demo</h3>
                <button
                  onClick={() => setShowDemoModal(false)}
                  className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 aspect-video rounded-2xl bg-slate-800 flex flex-col items-center justify-center p-6 text-center">
                <FiPlay className="text-5xl text-amber-400 fill-amber-400 mb-3 animate-pulse" />
                <p className="text-base font-bold text-white">Interactive Vendor Onboarding Overview</p>
                <p className="text-xs text-slate-400 mt-1">Select any subscription plan below to get started in under 10 minutes.</p>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={() => { setShowDemoModal(false); scrollToWizard(); }} variant="gold" size="sm" className="font-bold text-black">
                  Start Registration
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MOBILE STICKY CTA BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 border-t border-amber-500/30 p-3 backdrop-blur-md md:hidden flex items-center justify-between shadow-2xl">
        <div>
          <p className="text-xs font-extrabold text-white">Sell on Dwell Mart</p>
          <p className="text-[10px] text-amber-400 font-bold">Marketplace • Quick Commerce • B2B</p>
        </div>
        <Button
          onClick={scrollToWizard}
          variant="gold"
          size="sm"
          className="font-extrabold text-black text-xs py-2 px-4 shadow-md"
        >
          Start Selling
        </Button>
      </div>

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
};

export default SellOnDwellmart;
