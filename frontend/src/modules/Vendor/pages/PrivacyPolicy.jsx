import { Link } from 'react-router-dom';
import { FiArrowLeft, FiShield, FiUser, FiPhone, FiMail, FiCheckCircle, FiLock } from 'react-icons/fi';

const VendorPrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <Link
            to="/vendor/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <FiArrowLeft className="text-base" /> Back to Vendor Login
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 text-emerald-700">
            <FiShield className="w-3.5 h-3.5" /> Public Vendor Policy
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
              <FiShield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Vendor Privacy Policy
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Effective Date: August 2026 • DwellMart Merchant Partner Network
              </p>
            </div>
          </div>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            DwellMart is committed to maintaining the confidentiality, integrity, and security of all business information, catalog data, financial transactions, and account details submitted by vendor partners.
          </p>
        </div>

        {/* Content Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-8 space-y-8 text-slate-700 leading-relaxed text-sm sm:text-base">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <FiCheckCircle className="text-emerald-600" /> 1. Merchant Data Collection
            </h2>
            <p>
              When you register as a vendor on DwellMart, we collect essential merchant details including store name, business registration, Tax/GST numbers, identity verification documents, business address, and contact information.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <FiLock className="text-emerald-600" /> 2. Catalog & Pricing Privacy
            </h2>
            <p>
              Product inventory data, wholesale pricing rules, and stock levels are securely processed solely for rendering customer storefronts and processing transactions. Your private supplier information and cost metrics are never disclosed publicly.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <FiCheckCircle className="text-emerald-600" /> 3. Financial & Settlement Security
            </h2>
            <p>
              Bank account details and payout settlement records provided for vendor earnings are encrypted. Automated payouts are executed via PCI-DSS compliant banking partners.
            </p>
          </section>

          {/* Section 4 - Primary Contact Card */}
          <section className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FiUser className="text-emerald-600" /> Vendor Privacy & Operational Officer
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              For any vendor account privacy inquiries, data deletion requests, or compliance concerns, please contact our designated operations lead:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                  <FiUser className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block font-medium">Contact Person</span>
                  <span className="text-sm font-bold text-slate-900">Devesh Lal</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                  <FiPhone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block font-medium">Mobile / Call</span>
                  <a href="tel:9999188143" className="text-sm font-bold text-slate-900 hover:text-emerald-600">
                    9999188143
                  </a>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                  <FiMail className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block font-medium">Email Address</span>
                  <a href="mailto:davesh0007@gmail.com" className="text-sm font-bold text-slate-900 hover:text-emerald-600 truncate block">
                    davesh0007@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Footer note */}
          <div className="pt-4 text-xs text-slate-400 text-center border-t border-slate-100">
            © {new Date().getFullYear()} DwellMart Merchant Services. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorPrivacyPolicy;
