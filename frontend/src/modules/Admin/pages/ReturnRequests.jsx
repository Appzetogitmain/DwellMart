import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiEye, FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from '../components/DataTable';
import ExportButton from '../components/ExportButton';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';
import { useReturnStore } from '../../../shared/store/returnStore';

const ReturnRequests = () => {
  const navigate = useNavigate();
  const {
    returnRequests,
    isLoading,
    pagination,
    fetchReturnRequests,
    updateReturnStatus,
  } = useReturnStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    const now = new Date();
    const formatDate = (date) => date.toISOString().slice(0, 10);
    let startDate;
    let endDate;

    if (dateFilter === 'today') {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      startDate = formatDate(today);
      endDate = formatDate(today);
    } else if (dateFilter === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      startDate = formatDate(weekStart);
      endDate = formatDate(now);
    } else if (dateFilter === 'month') {
      const monthStart = new Date(now);
      monthStart.setDate(now.getDate() - 30);
      monthStart.setHours(0, 0, 0, 0);
      startDate = formatDate(monthStart);
      endDate = formatDate(now);
    }

    fetchReturnRequests({
      search: searchQuery,
      status: selectedStatus === 'all' ? undefined : selectedStatus,
      startDate,
      endDate,
    });
  }, [searchQuery, selectedStatus, dateFilter, fetchReturnRequests]);

  const filteredRequests = useMemo(() => {
    return returnRequests;
  }, [returnRequests]);

  // Handle status update
  const handleStatusUpdate = async (requestId, newStatus, action = '') => {
    const statusData = { status: newStatus };

    if (newStatus === 'approved' && action === 'approve') {
      statusData.refundStatus = 'pending';
    } else if (newStatus === 'completed' && action === 'process-refund') {
      statusData.refundStatus = 'processed';
    }

    await updateReturnStatus(requestId, statusData);
  };

  // Get status badge variant
  const getStatusVariant = (status) => {
    const statusMap = {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
      processing: 'processing',
      completed: 'completed',
    };
    return statusMap[status] || 'pending';
  };

  // Table columns
  const columns = [
    {
      key: 'id',
      label: 'Return ID',
      sortable: true,
      render: (value) => <span className="font-semibold">{value}</span>,
    },
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (value) => (
        <span className="text-blue-600 hover:text-blue-800 cursor-pointer" onClick={() => navigate(`/admin/orders/${value}`)}>
          {value}
        </span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      sortable: true,
      render: (value) => (
        <div>
          <p className="font-medium text-gray-800">{value.name}</p>
          <p className="text-xs text-gray-500">{value.email}</p>
        </div>
      ),
    },
    {
      key: 'requestDate',
      label: 'Request Date',
      sortable: true,
      render: (value) => formatDateTime(value),
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (value) => {
        const count = Array.isArray(value) ? value.length : 0;
        return <span>{count} item{count !== 1 ? 's' : ''}</span>;
      },
    },
    {
      key: 'reason',
      label: 'Reason',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">{value}</span>
      ),
    },
    {
      key: 'refundAmount',
      label: 'Refund Amount',
      sortable: true,
      render: (value) => (
        <span className="font-bold text-gray-800">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => <Badge variant={getStatusVariant(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/admin/return-requests/${row.id}`)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details"
          >
            <FiEye />
          </button>
          {row.status === 'pending' && (
            <>
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to approve this return request?')) {
                    handleStatusUpdate(row.id, 'approved', 'approve');
                  }
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve"
              >
                <FiCheck />
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to reject this return request?')) {
                    handleStatusUpdate(row.id, 'rejected', 'reject');
                  }
                }}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reject"
              >
                <FiX />
              </button>
            </>
          )}
          {row.status === 'approved' && row.refundStatus === 'pending' && (
            <button
              onClick={() => {
                if (window.confirm('Process refund for this return request?')) {
                  handleStatusUpdate(row.id, 'completed', 'process-refund');
                }
              }}
              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Process Refund"
            >
              <FiRefreshCw />
            </button>
          )}
        </div>
      ),
    },
  ];

  // Get status counts for stats
  const statusCounts = useMemo(() => {
    return {
      all: filteredRequests.length,
      pending: filteredRequests.filter((r) => r.status === 'pending').length,
      approved: filteredRequests.filter((r) => r.status === 'approved').length,
      processing: filteredRequests.filter((r) => r.status === 'processing').length,
      completed: filteredRequests.filter((r) => r.status === 'completed').length,
      rejected: filteredRequests.filter((r) => r.status === 'rejected').length,
    };
  }, [filteredRequests]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Return Requests</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage and process customer return requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Total</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-800">{statusCounts.all}</p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Pending</p>
          <p className="text-lg sm:text-2xl font-bold text-yellow-600">{statusCounts.pending}</p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Approved</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600">{statusCounts.approved}</p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Processing</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-600">{statusCounts.processing}</p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Completed</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600">{statusCounts.completed}</p>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">Rejected</p>
          <p className="text-lg sm:text-2xl font-bold text-red-600">{statusCounts.rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          {/* Search */}
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, order ID, name, or email..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>

          {/* Status Filter */}
          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'processing', label: 'Processing' },
              { value: 'completed', label: 'Completed' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          {/* Date Filter */}
          <AnimatedSelect
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Time' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Last 7 Days' },
              { value: 'month', label: 'Last 30 Days' },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          {/* Export Button */}
          <div className="w-full sm:w-auto">
            <ExportButton
              data={filteredRequests}
              headers={[
                { label: 'Return ID', accessor: (row) => row.id },
                { label: 'Order ID', accessor: (row) => row.orderId },
                { label: 'Customer', accessor: (row) => row.customer.name },
                { label: 'Email', accessor: (row) => row.customer.email },
                { label: 'Request Date', accessor: (row) => formatDateTime(row.requestDate) },
                { label: 'Items', accessor: (row) => row.items.length },
                { label: 'Reason', accessor: (row) => row.reason },
                { label: 'Refund Amount', accessor: (row) => formatCurrency(row.refundAmount) },
                { label: 'Status', accessor: (row) => row.status },
              ]}
              filename="return-requests"
            />
          </div>
        </div>
      </div>

      {/* Return Requests Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center text-gray-500">
          Loading return requests...
        </div>
      ) : (
        <DataTable
          data={filteredRequests}
          columns={columns}
          pagination={true}
          itemsPerPage={itemsPerPage}
          showSizeChanger={true}
          onPageSizeChange={(newSize) => setItemsPerPage(newSize)}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          onRowClick={(row) => navigate(`/admin/return-requests/${row.id}`)}
        />
      )}
    </motion.div>
  );
};

export default ReturnRequests;

