import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { Button } from '../Button';
import { Select } from '../Select';

export const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  pageSize = 10,
  totalItems = null,
  onPageSizeChange = null,
  showSizeChanger = false,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}) => {
  // Generate page numbers with smart ellipses calculation
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 1);
      let end = Math.min(totalPages, currentPage + 1);

      if (currentPage <= 3) {
        start = 1;
        end = 4;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages;
      }

      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const handlePageClick = (page) => {
    if (typeof page === 'number' && page !== currentPage && page >= 1 && page <= totalPages) {
      if (onPageChange) onPageChange(page);
    }
  };

  return (
    <nav
      role="navigation"
      aria-label="Pagination Navigation"
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-3 border-t border-borderToken-default ${className}`}
    >
      {/* Items Summary Info */}
      <div className="text-xs text-textColor-muted font-medium">
        {totalItems !== null ? (
          <span>
            Showing <strong className="text-textColor-primary">{Math.min((currentPage - 1) * pageSize + 1, totalItems)}</strong> to{' '}
            <strong className="text-textColor-primary">{Math.min(currentPage * pageSize, totalItems)}</strong> of{' '}
            <strong className="text-textColor-primary">{totalItems}</strong> items
          </span>
        ) : (
          <span>
            Page <strong className="text-textColor-primary">{currentPage}</strong> of{' '}
            <strong className="text-textColor-primary">{totalPages}</strong>
          </span>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Previous Page Button */}
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage <= 1}
          onClick={() => handlePageClick(currentPage - 1)}
          aria-label="Previous Page"
          leftIcon={<FiChevronLeft />}
        >
          Prev
        </Button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-textColor-muted font-bold">
                  ...
                </span>
              );
            }
            const isCurrent = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={`Page ${page}`}
                onClick={() => handlePageClick(page)}
                className={`min-w-[32px] h-8 px-2 rounded-btn text-xs font-bold transition-colors duration-150 ${
                  isCurrent
                    ? 'bg-brand-primary text-textColor-brand shadow-sm font-black'
                    : 'bg-surface-card text-textColor-primary hover:bg-borderToken-light border border-borderToken-default'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Page Button */}
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage >= totalPages}
          onClick={() => handlePageClick(currentPage + 1)}
          aria-label="Next Page"
          rightIcon={<FiChevronRight />}
        >
          Next
        </Button>

        {/* Optional Page Size Changer */}
        {showSizeChanger && onPageSizeChange && (
          <div className="ml-2 w-28">
            <Select
              size="sm"
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              options={pageSizeOptions.map((opt) => ({
                value: String(opt),
                label: `${opt} / page`,
              }))}
            />
          </div>
        )}
      </div>
    </nav>
  );
};

export default Pagination;
