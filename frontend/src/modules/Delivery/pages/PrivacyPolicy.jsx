import { Link } from 'react-router-dom';
import { FiArrowLeft, FiShield, FiUser, FiPhone, FiMail, FiMapPin, FiCheckCircle, FiLock } from 'react-icons/fi';

const DeliveryPrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <Link
            to="/delivery/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <FiArrowLeft className="text-base" /> Back to Delivery Login
          </Link>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
            Delivery Partner Policy
          </span>
        </div>

        {/* Hero Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-amber-500/20 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/30 shrink-0">
              <FiShield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Delivery Partner Privacy Policy
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Effective Date: August 2026 • DwellMart Delivery Fleet
              </p>
            </div>
          </div>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            DwellMart values the privacy and security of our delivery partners. This policy details how location tracking, personal credentials, delivery logs, and cash settlement records are safeguarded.
          </p>
        </div>

        {/* Content Section */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 p-6 sm:p-8 space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <FiMapPin className="text-amber-400" /> 1. Location & Route Data Usage
            </h2>
            <p>
              We collect precise background and foreground location data while you are toggled online in the Delivery app. This data is exclusively used to assign nearby pickup orders, calculate customer delivery ETAs, and optimize trip routing. Location tracking stops immediately when you switch off your online status or log out.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <FiLock className="text-amber-400" /> 2. Partner Onboarding & Document Security
            </h2>
            <p>
              Identity documents such as driving licenses, vehicle registration certificates, and Aadhaar/PAN details submitted during delivery partner registration are encrypted and stored in compliance with local regulations for verification and background checks.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <FiCheckCircle className="text-amber-400" /> 3. Cash-on-Delivery & Wallet Settlements
            </h2>
            <p>
              Trip earnings, cash collection logs, and settlement transactions are recorded accurately. Your financial details for weekly or daily bank payouts are protected using industry-standard encryption protocols.
            </p>
          </section>

          {/* Section 4 - Direct Contact Box */}
          <section className="bg-slate-800/90 border border-amber-500/30 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiUser className="text-amber-400" /> Rider Fleet & Privacy Officer
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              For any rider privacy concerns, location permission inquiries, or account data deletion requests, contact our fleet manager:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg shrink-0">
                  <FiUser className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Contact Person</span>
                  <span className="text-sm font-bold text-white">Devesh Lal</span>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg shrink-0">
                  <FiPhone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Mobile / Helpline</span>
                  <a href="tel:9999188143" className="text-sm font-bold text-amber-400 hover:underline">
                    9999188143
                  </a>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg shrink-0">
                  <FiMail className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Support Email</span>
                  <a href="mailto:davesh0007@gmail.com" className="text-sm font-bold text-amber-400 hover:underline truncate block">
                    davesh0007@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Footer note */}
          <div className="pt-4 text-xs text-slate-500 text-center border-t border-slate-800">
            © {new Date().getFullYear()} DwellMart Delivery Fleet Operations. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryPrivacyPolicy;
