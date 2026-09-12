import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import VendorShowcaseCard from './VendorShowcaseCard';
import { getApprovedVendors } from '../../data/catalogData';
import { usePageTranslation } from '../../../../hooks/usePageTranslation';

const FeaturedVendorsSection = ({ vendors = null }) => {
  const { getTranslatedText: t } = usePageTranslation(["Best Sellers", "Shop from top-rated verified stores", "See All"]);
  const scrollContainerRef = useRef(null);

  // Mouse drag-to-scroll state
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [isGrabbing, setIsGrabbing] = useState(false);

  const approvedVendors = Array.isArray(vendors) && vendors.length > 0
    ? vendors
    : getApprovedVendors();
  const featuredVendors = approvedVendors.slice(0, 15);
  const count = featuredVendors.length;

  // Natural mouse-wheel horizontal scrolling on desktop
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // If user is performing horizontal trackpad swipe or Shift+wheel, let native handle it
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;

      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      if (maxScrollLeft <= 0) return; // Everything fits on screen

      const isScrollingDown = e.deltaY > 0;
      const canScrollRight = el.scrollLeft < maxScrollLeft - 1;
      const canScrollLeft = el.scrollLeft > 1;

      // Only intercept when the carousel can scroll in that direction
      if ((isScrollingDown && canScrollRight) || (!isScrollingDown && canScrollLeft)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [featuredVendors.length]);

  // Global mouseup safety for drag release
  useEffect(() => {
    const onGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsGrabbing(false);
      }
    };
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => window.removeEventListener('mouseup', onGlobalMouseUp);
  }, []);

  // Mouse drag handlers
  const onMouseDown = (e) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (e.button !== 0) return; // Primary click only

    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftRef.current = el.scrollLeft;
    setIsGrabbing(true);
  };

  const onMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const x = e.pageX - el.offsetLeft;
    const walk = x - startXRef.current;
    if (Math.abs(walk) > 4) {
      hasDraggedRef.current = true;
    }
    el.scrollLeft = scrollLeftRef.current - walk;
  };

  const onMouseUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsGrabbing(false);
  };

  const onClickCapture = (e) => {
    // If the mouse moved while dragging, prevent accidental link clicks
    if (hasDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      hasDraggedRef.current = false;
    }
  };

  if (featuredVendors.length === 0) return null;

  return (
    <div className="px-4 py-4 w-full">
      {/* Section Header: Clean title on left, See All on right, NO arrows */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-content">{t("Best Sellers")}</h2>
          <p className="text-xs text-content-secondary mt-0.5">{t("Shop from top-rated verified stores")}</p>
        </div>

        <Link
          to="/sellers"
          className="flex items-center gap-1 text-sm text-brand-primary font-semibold hover:underline transition-colors flex-shrink-0"
        >
          <span>{t("See All")}</span>
          <FiArrowRight className="text-sm" />
        </Link>
      </div>

      {/* Natural Horizontal Scrollable Row */}
      <div
        ref={scrollContainerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClickCapture={onClickCapture}
        className={`flex flex-nowrap items-stretch gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2 pt-1 w-full snap-x snap-mandatory touch-pan-x overscroll-x-contain select-none ${
          isGrabbing ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
        }}
      >
        {featuredVendors.map((vendor, index) => (
          <div
            key={vendor.id || vendor._id || index}
            className={`best-seller-carousel-item ${
              count === 1 ? 'max-w-[320px] !w-full' : ''
            }`}
          >
            <VendorShowcaseCard vendor={vendor} index={index} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeaturedVendorsSection;

