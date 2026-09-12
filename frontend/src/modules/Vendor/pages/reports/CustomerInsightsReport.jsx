import { useMemo, useState, useEffect } from 'react';
import { FiUsers, FiRepeat, FiDollarSign } from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from '../../../Admin/components/DataTable';
import ExportButton from '../../../Admin/components/ExportButton';
import { formatPrice } from '../../../../shared/utils/helpers';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorOrders } from '../../services/vendorService';

const CustomerInsightsReport = () => {
  const { vendor } = useVendorAuthStore();
  const [orders, setOrders] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) {
      setOrders([]);
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await getVendorOrders({ limit: 500 });
        const data = res?.data ?? res;
        setOrders(data?.orders ?? []);
      } catch {
        setOrders([]);
      }
    };

    fetchOrders();
  }, [vendorId]);

  const customerData = useMemo(() => {
    const customerMap = {};

    orders.forEach((order) => {
      const vendorItem = order.vendorItems?.find(
        (vi) => vi.vendorId?.toString() === vendorId?.toString()
      );
      if (!vendorItem) return;

      const customerId = String(
        order.customer?._id || order.userId?._id || order.userId || 'guest'
      );
      const customerName = order.customer?.name || 'Guest Customer';
      const customerEmail = order.customer?.email || '';

      if (!customerMap[customerId]) {
        customerMap[customerId] = {
          id: customerId,
          name: customerName,
          email: customerEmail,
          orders: 0,
          totalSpent: 0,
          lastOrderDate: null,
        };
      }

      customerMap[customerId].orders += 1;
      customerMap[customerId].totalSpent += vendorItem.subtotal || vendorItem.vendorEarnings || 0;

      const orderDate = new Date(order.createdAt ?? order.date);
      if (!customerMap[customerId].lastOrderDate || orderDate > new Date(customerMap[customerId].lastOrderDate)) {
        customerMap[customerId].lastOrderDate = order.createdAt ?? order.date;
      }
    });

    return Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders, vendorId]);

  const repeatCustomers = customerData.filter((c) => c.orders > 1).length;
  const totalCustomers = customerData.length;
  const averageOrderValue = customerData.length > 0
    ? customerData.reduce((sum, c) => sum + c.totalSpent, 0) / customerData.length
    : 0;

  const columns = [
    {
      key: 'name',
      label: 'Customer',
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          {row.email && (
            <p className="text-xs text-gray-500">{row.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'orders',
      label: 'Orders',
      sortable: true,
      render: (value) => (
        <span className="font-semibold">{value}</span>
      ),
    },
    {
      key: 'totalSpent',
      label: 'Total Spent',
      sortable: true,
      render: (value) => (
        <span className="font-bold text-gray-800">{formatPrice(value)}</span>
      ),
    },
    {
      key: 'lastOrderDate',
      label: 'Last Order',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {value ? new Date(value).toLocaleDateString() : 'N/A'}
        </span>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view reports</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Customers</p>
            <FiUsers className="text-blue-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{totalCustomers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Repeat Customers</p>
            <FiRepeat className="text-green-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{repeatCustomers}</p>
          <p className="text-xs text-gray-500 mt-1">
            {totalCustomers > 0 ? ((repeatCustomers / totalCustomers) * 100).toFixed(1) : 0}% of total
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Average Order Value</p>
            <FiDollarSign className="text-purple-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{formatPrice(averageOrderValue)}</p>
        </div>
      </div>

      {/* Export Button */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex justify-end">
          <ExportButton
            data={customerData}
            headers={[
              { label: 'Customer', accessor: (row) => row.name },
              { label: 'Email', accessor: (row) => row.email },
              { label: 'Orders', accessor: (row) => row.orders },
              { label: 'Total Spent', accessor: (row) => formatPrice(row.totalSpent) },
              { label: 'Last Order', accessor: (row) => row.lastOrderDate ? new Date(row.lastOrderDate).toLocaleDateString() : 'N/A' },
            ]}
            filename="vendor-customer-insights"
          />
        </div>
      </div>

      {/* Customers Table */}
      {customerData.length > 0 ? (
        <DataTable
          data={customerData}
          columns={columns}
          pagination={true}
          itemsPerPage={itemsPerPage}
          showSizeChanger={true}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          onPageSizeChange={setItemsPerPage}
        />
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">No customer data available</p>
        </div>
      )}
    </div>
  );
};

export default CustomerInsightsReport;

