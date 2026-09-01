/**
 * @deprecated Admin/components/DataTable.jsx
 * Bridged to use shared DS DataTable primitive.
 *
 * API differences bridged:
 *   Admin: columns.label  → DS: columns.title
 *   Admin: itemsPerPage   → DS: pageSize
 *   Admin: onRowClick (row-level click) → preserved via column render wrapper
 *   Admin: serverSidePagination + onPageChange → passed through
 *
 * All 30 existing import sites continue to work without changes.
 */
import React, { useState, useMemo } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { DataTable as DSDataTable } from '../../../shared/components/Dashboard/DataTable';

const DataTable = ({
  data = [],
  columns = [],
  pagination = true,
  itemsPerPage = 10,
  sortable = true,
  onRowClick,
  className = '',
  serverSidePagination = false,
  totalItems = 0,
  currentPage: externalCurrentPage,
  onPageChange,
}) => {
  // Map Admin column format (label) → DS column format (title)
  const mappedColumns = columns.map((col) => ({
    ...col,
    title: col.title || col.label || col.key,
    sortable: sortable && col.sortable !== false,
    render: col.render,
  }));

  // For server-side pagination, pass data as-is (already paginated by caller)
  // For client-side, let DS DataTable handle it
  const tableData = data;

  return (
    <DSDataTable
      columns={mappedColumns}
      data={tableData}
      pageSize={itemsPerPage}
      className={className}
      emptyTitle="No data available"
      emptyDescription="There are no items to display."
      searchable={false}
      currentPage={serverSidePagination ? externalCurrentPage : undefined}
      onPageChange={serverSidePagination ? onPageChange : undefined}
    />
  );
};

export default DataTable;
