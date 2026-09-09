import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Button from './Button';

const Pagination = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  showSizeChanger = false,
  onPageSizeChange = null,
  pageSizeOptions = [25, 50, 100, 250, 500, 'All'],
  className = '',
}) => {
  if (totalPages <= 1 && !showSizeChanger) return null;

  const isAll = String(itemsPerPage).toLowerCase() === 'all';
  const numericItemsPerPage = isAll ? (totalItems || 1000) : (Number(itemsPerPage) || 10);
  const startItem = totalItems === 0 ? 0 : isAll ? 1 : Math.min((currentPage - 1) * numericItemsPerPage + 1, totalItems);
  const endItem = isAll ? totalItems : Math.min(currentPage * numericItemsPerPage, totalItems);

  const handlePageChange = (page) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    if (onPageChange) {
      onPageChange(newPage);
    }
  };

  return (
    <div className={`bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 border-t border-gray-200 ${className}`}>
      <div className="text-xs sm:text-sm text-gray-700">
        Showing {startItem} to {endItem} of {totalItems} results
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          variant="secondary"
          icon={FiChevronLeft}
          aria-label="Previous page"
        />
        <div className="flex items-center gap-1">
          {[...Array(Math.max(1, totalPages))].map((_, index) => {
            const page = index + 1;
            // Show first, last, current, and adjacent pages
            if (
              page === 1 ||
              page === totalPages ||
              (page >= currentPage - 1 && page <= currentPage + 1)
            ) {
              return (
                <Button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  variant={currentPage === page ? 'primary' : 'ghost'}
                  size="sm"
                  className={currentPage === page ? '' : 'text-gray-700'}
                  aria-label={`Go to page ${page}`}
                >
                  {page}
                </Button>
              );
            } else if (
              page === currentPage - 2 ||
              page === currentPage + 2
            ) {
              return <span key={page} className="px-1">...</span>;
            }
            return null;
          })}
        </div>
        <Button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          variant="secondary"
          icon={FiChevronRight}
          aria-label="Next page"
        />
        {showSizeChanger && onPageSizeChange && (
          <select
            value={isAll ? 'all' : String(itemsPerPage)}
            onChange={(e) => {
              const val = e.target.value;
              onPageSizeChange(val.toLowerCase() === 'all' ? 'all' : Number(val));
            }}
            className="ml-2 text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {pageSizeOptions.map((opt) => {
              const optIsAll = String(opt).toLowerCase() === 'all';
              return (
                <option key={String(opt)} value={optIsAll ? 'all' : String(opt)}>
                  {optIsAll ? 'All' : `${opt} / page`}
                </option>
              );
            })}
          </select>
        )}
      </div>
    </div>
  );
};

export default Pagination;

