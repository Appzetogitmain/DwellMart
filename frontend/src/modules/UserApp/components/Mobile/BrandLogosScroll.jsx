import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getCatalogBrands } from '../../data/catalogData';

const placeholderLogo = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect fill="#f5f5f5" width="120" height="80"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#999" font-size="14" font-family="Arial">Brand</text></svg>')}`;

const BrandLogosScroll = ({ brands = null }) => {
    const navigate = useNavigate();
    const containerRef = useRef(null);
    const [cardWidth, setCardWidth] = useState(null);

    const fallbackBrands = getCatalogBrands().slice(0, 10);
    const displayBrands = Array.isArray(brands) && brands.length > 0
        ? brands.slice(0, 10)
        : fallbackBrands;

    useEffect(() => {
        if (!containerRef.current) return;

        const calculateWidth = () => {
            const available = containerRef.current.clientWidth;
            if (available > 0) {
                const gap = 10; // 10px gap
                const columns = 4; // exactly 4 brands visible without cut-off
                // subtract 2px to ensure no rounding overflow
                const computed = Math.floor((available - (gap * (columns - 1)) - 2) / columns);
                setCardWidth(Math.max(computed, 64));
            }
        };

        calculateWidth();
        const ro = new ResizeObserver(calculateWidth);
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    return (
        <section className="bg-transparent w-full overflow-hidden px-4 py-3">
            {/* Desktop Layout - White card container full width */}
            <div className="hidden md:block bg-white rounded-2xl mb-4 p-5 shadow-sm border border-gray-100/80 w-full">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 tracking-tight">Top Brands</h2>
                    <button
                        onClick={() => navigate('/brands')}
                        className="text-sm font-semibold text-brand-primary hover:underline transition-colors"
                    >
                        See All &rarr;
                    </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4 w-full items-center justify-between">
                    {displayBrands.map((brand, index) => (
                        <motion.div
                            key={brand.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.03, duration: 0.2 }}
                            className="flex flex-col items-center w-full"
                        >
                            <div
                                onClick={() => navigate(`/brand/${brand.id}`)}
                                className="bg-gray-50/80 rounded-xl p-2.5 shadow-sm transition-all duration-300 flex items-center justify-center w-full aspect-square group cursor-pointer border border-gray-200/60 hover:shadow-md hover:border-amber-400 hover:bg-white"
                            >
                                <img
                                    src={brand.logo || placeholderLogo}
                                    alt={brand.name}
                                    className="w-4/5 h-4/5 object-contain transition-transform group-hover:scale-110"
                                    onError={(e) => {
                                        e.target.src = placeholderLogo;
                                    }}
                                    loading="lazy"
                                />
                            </div>
                            <p className="text-xs font-semibold text-gray-700 text-center truncate w-full mt-2 group-hover:text-brand-primary">
                                {brand.name}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Mobile Layout */}
            <div className="md:hidden w-full">
                <div className="flex items-center justify-between px-1 mb-2.5">
                    <h2 className="text-lg font-bold text-gray-800 tracking-tight">Top Brands</h2>
                    <button
                        onClick={() => navigate('/brands')}
                        className="text-xs font-semibold text-brand-primary hover:underline transition-colors"
                    >
                        See All &rarr;
                    </button>
                </div>
                <div
                    ref={containerRef}
                    className="w-full overflow-x-auto scrollbar-hide snap-x snap-mandatory"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <div className="flex gap-2.5 min-w-max pb-2">
                        {displayBrands.map((brand, index) => (
                            <motion.div
                                key={brand.id}
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "-20px" }}
                                transition={{ delay: index * 0.04, duration: 0.25 }}
                                className="flex-shrink-0 flex flex-col items-center snap-start"
                                style={{
                                    width: cardWidth ? `${cardWidth}px` : '70px',
                                    minWidth: cardWidth ? `${cardWidth}px` : '70px',
                                    maxWidth: cardWidth ? `${cardWidth}px` : '70px',
                                }}
                            >
                                <div
                                    onClick={() => navigate(`/brand/${brand.id}`)}
                                    className="bg-white rounded-xl p-2 shadow-xs transition-all duration-300 flex items-center justify-center w-full aspect-square group cursor-pointer border border-gray-100 mb-1 hover:shadow-md hover:border-amber-400 active:scale-95"
                                >
                                    <img
                                        src={brand.logo || placeholderLogo}
                                        alt={brand.name}
                                        className="w-[82%] h-[82%] object-contain"
                                        onError={(e) => {
                                            e.target.src = placeholderLogo;
                                        }}
                                        loading="lazy"
                                    />
                                </div>
                                <p className="text-[11px] sm:text-xs font-semibold text-gray-800 text-center transition-colors truncate w-full px-0.5 mt-1">
                                    {brand.name}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default BrandLogosScroll;
