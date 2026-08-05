import DesktopHeader from './DesktopHeader';
import MobileHeader from './MobileHeader';
import Footer from './Footer';

/**
 * Reusable Layout Wrapper for Public Information & Policy Pages
 * Renders standard Dwell Mart DesktopHeader, MobileHeader, main content slot, and Footer.
 */
const PublicPageLayout = ({ children, className = '' }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased selection:bg-[#ffc101]/30 selection:text-black">
      {/* Global Headers */}
      <DesktopHeader />
      <MobileHeader />

      {/* Main Content Slot */}
      <main className={`flex-1 w-full ${className}`}>
        {children}
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
};

export default PublicPageLayout;
