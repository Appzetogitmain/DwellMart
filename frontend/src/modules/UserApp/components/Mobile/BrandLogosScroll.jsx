import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getCatalogBrands } from '../../data/catalogData';

const placeholderLogo = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect fill="#f5f5f5" width="120" height="80"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#999" font-size="14" font-family="Arial">Brand</text></svg>')}`;

const BrandLogosScroll = ({ brands = null }) => {
    const navigate = useNavigate();
    const fallbackBrands = getCatalogBrands().slice(0, 10);
    const displayBrands = Array.isArray(brands) && brands.length > 0
        ? brands.slice(0, 10)
        : fallbackBrands;

    return (
        <section className="bg-transparent w-full overflow-hidden px-4 py-3">
            {/* Desktop Layout - White card container full width */}
            <div className="hidden md:block bg-white rounded-2xl mb-4 p-5 shadow-sm border border-gray-100/80 w-full">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 tracking-tight">Top Brands</h2>
                    <button
                        onClick={() => navigate('/categories')}
                        className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
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
                            <p className="text-xs font-semibold text-gray-700 text-center truncate w-full mt-2 group-hover:text-primary-600">
                                {brand.name}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Mobile Layout - Unchanged */}
            <div className="md:hidden w-full">
                <style>{`
          @media (min-width: 1024px) {
            .brand-card-desktop {
              width: 5rem !important;
              min-width: 5rem !important;
              max-width: 5rem !important;
            }
          }
          @media (min-width: 1280px) {
            .brand-card-desktop {
              width: 6rem !important;
              min-width: 6rem !important;
              max-width: 6rem !important;
            }
          }
        `}</style>
                <div className="w-full overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="flex gap-3 sm:gap-4 lg:gap-3 min-w-max px-4 pb-2">
                        {displayBrands.map((brand, index) => (
                            <motion.div
                                key={brand.id}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                className="flex-shrink-0 flex flex-col items-center brand-card-desktop"
                                style={{
                                    width: 'calc((100vw - 2rem - 0.75rem * 3) / 4)',
                                    minWidth: 'calc((100vw - 2rem - 0.75rem * 3) / 4)',
                                    maxWidth: 'calc((100vw - 2rem - 0.75rem * 3) / 4)',
                                }}
                            >
                                <div
                                    onClick={() => navigate(`/brand/${brand.id}`)}
                                    className="bg-white rounded-lg sm:rounded-xl lg:rounded-lg p-1.5 sm:p-2 md:p-2 lg:p-1.5 xl:p-2 shadow-md transition-all duration-300 flex items-center justify-center w-full aspect-square group cursor-pointer border border-gray-100 mb-1.5 lg:mb-1 hover:shadow-lg">
                                    <img
                                        src={brand.logo || placeholderLogo}
                                        alt={brand.name}
                                        className="w-[85%] h-[85%] lg:w-[80%] lg:h-[80%] object-contain"
                                        onError={(e) => {
                                            e.target.src = placeholderLogo;
                                        }}
                                        loading="lazy"
                                    />
                                </div>
                                <p className="text-xs sm:text-sm lg:text-xs font-semibold text-black text-center transition-colors truncate w-full px-1">
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
