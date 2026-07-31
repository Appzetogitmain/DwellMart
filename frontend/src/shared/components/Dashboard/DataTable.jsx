import React, { useState, useMemo } from 'react';
import { FiSearch, FiChevronUp, FiChevronDown } from 'react-icons/fi';
import { Card, Input, Pagination, SkeletonLoader, EmptyState } from '../ui';

export const DataTable = ({
  columns = [],
  data = [],
  loading = false,
  searchable = true,
  searchPlaceholder = 'Search table...',
  pageSize = 10,
  emptyTitle = 'No Records Found',
  emptyDescription = 'There are no items to display in this table.',
  bulkActions = null,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Filter data by search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const lowerQ = searchQuery.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(lowerQ)
      )
    );
  }, [data, searchQuery]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <Card variant="default" padding="none" className={`bg-surface-card border-borderToken-default overflow-hidden ${className}`}>
      {/* Table Header Controls */}
      {(searchable || bulkActions) && (
        <div className="p-4 border-b border-borderToken-default flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-card">
          {searchable && (
            <div className="w-full sm:w-72">
              <Input
                size="sm"
                leftIcon={<FiSearch />}
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
          {bulkActions && <div className="flex items-center gap-2">{bulkActions}</div>}
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto scrollbar-hide">
        {loading ? (
          <div className="p-4">
            <SkeletonLoader.Table rows={pageSize} />
          </div>
        ) : paginatedData.length === 0 ? (
          <EmptyState
            variant="no-data"
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-borderToken-default bg-surface-background text-textColor-muted font-bold uppercase tracking-wider">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`px-4 py-3 select-none ${
                      col.sortable ? 'cursor-pointer hover:text-textColor-primary' : ''
                    } ${col.className || ''}`}
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.title}</span>
                      {col.sortable && sortConfig.key === col.key && (
                        <span>
                          {sortConfig.direction === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderToken-default">
              {paginatedData.map((row, rowIdx) => (
                <tr
                  key={row.id ?? row._id ?? rowIdx}
                  className="hover:bg-borderToken-light/40 transition-colors duration-150 text-textColor-primary font-medium"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 align-middle ${col.className || ''}`}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {!loading && sortedData.length > pageSize && (
        <div className="p-4 border-t border-borderToken-default flex justify-end bg-surface-card">
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(sortedData.length / pageSize)}
            totalItems={sortedData.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </Card>
  );
};

export default DataTable;
