import { useState, useMemo, useEffect } from 'react';
import { FiDownload, FiCalendar, FiTrendingUp } from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from '../../../Admin/components/DataTable';
import ExportButton from '../../../Admin/components/ExportButton';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';
import { formatPrice } from '../../../../shared/utils/helpers';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorOrders } from '../../services/vendorService';

const SalesReport = () => {
  const { vendor } = useVendorAuthStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [periodFilter, setPeriodFilter] = useState('all');
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

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (periodFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();

      switch (periodFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter((order) => new Date(order.createdAt ?? order.date) >= filterDate);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          filtered = filtered.filter((order) => new Date(order.createdAt ?? order.date) >= filterDate);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          filtered = filtered.filter((order) => new Date(order.createdAt ?? order.date) >= filterDate);
          break;
        case 'year':
          filterDate.setFullYear(now.getFullYear() - 1);
          filtered = filtered.filter((order) => new Date(order.createdAt ?? order.date) >= filterDate);
          break;
        default:
          break;
      }
    }

    if (dateRange.start || dateRange.end) {
      filtered = filtered.filter((order) => {
        const orderDate = new Date(order.createdAt ?? order.date);
        const start = dateRange.start ? new Date(dateRange.start) : null;
        const end = dateRange.end ? new Date(dateRange.end) : null;
        return (!start || orderDate >= start) && (!end || orderDate <= end);
      });
    }

    return filtered;
  }, [orders, dateRange, periodFilter]);

  const totalSales = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      const vendorItem = order.vendorItems?.find(
        (vi) => vi.vendorId?.toString() === vendorId?.toString()
      );
      return sum + (vendorItem?.subtotal || vendorItem?.vendorEarnings || 0);
    }, 0);
  }, [filteredOrders, vendorId]);

  const totalOrders = filteredOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // Top selling products
  const topProducts = useMemo(() => {
    const productMap = {};
    filteredOrders.forEach((order) => {
      order.vendorItems?.forEach((vi) => {
        if (vi.vendorId?.toString() === vendorId?.toString()) {
          vi.items?.forEach((item) => {
            if (!productMap[item.id]) {
              productMap[item.id] = { name: item.name, quantity: 0, revenue: 0 };
            }
            productMap[item.id].quantity += item.quantity || 1;
            productMap[item.id].revenue += (item.price || 0) * (item.quantity || 1);
          });
        }
      });
    });
    return Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filteredOrders, vendorId]);

  const columns = [
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (_, row) => (
        <span className="font-semibold text-gray-800">{row.orderId ?? row._id}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (_, row) => new Date(row.createdAt ?? row.date).toLocaleDateString(),
    },
    {
      key: 'vendorItems',
      label: 'Amount',
      sortable: false,
      render: (value, row) => {
        const vendorItem = value?.find(
          (vi) => vi.vendorId?.toString() === vendorId?.toString()
        );
        return (
          <span className="font-bold text-gray-800">
            {formatPrice(vendorItem?.subtotal || vendorItem?.vendorEarnings || 0)}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${value === 'delivered' ? 'bg-green-100 text-green-800' :
            value === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
          }`}>
          {value}
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
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Sales</p>
            <FiTrendingUp className="text-green-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{formatPrice(totalSales)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Orders</p>
            <FiCalendar className="text-blue-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{totalOrders}</p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Average Order Value</p>
            <FiTrendingUp className="text-purple-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{formatPrice(averageOrderValue)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <AnimatedSelect
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Time' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Last 7 Days' },
              { value: 'month', label: 'Last 30 Days' },
              { value: 'year', label: 'Last Year' },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <div className="flex items-center gap-2 flex-1">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              placeholder="Start Date"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              placeholder="End Date"
            />
          </div>

          <ExportButton
            data={filteredOrders}
            headers={[
              { label: 'Order ID', accessor: (row) => row.orderId ?? row._id },
              {
                label: 'Date',
                accessor: (row) =>
                  new Date(row.createdAt ?? row.date).toLocaleDateString(),
              },
              {
                label: 'Amount', accessor: (row) => {
                  const vendorItem = row.vendorItems?.find(
                    (vi) => vi.vendorId?.toString() === vendorId?.toString()
                  );
                  return formatPrice(vendorItem?.subtotal || vendorItem?.vendorEarnings || 0);
                }
              },
              { label: 'Status', accessor: (row) => row.status },
            ]}
            filename="vendor-sales-report"
          />
        </div>
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Top Selling Products</h3>
          <div className="space-y-3">
            {topProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold text-gray-800">{product.name}</p>
                  <p className="text-sm text-gray-600">Quantity: {product.quantity}</p>
                </div>
                <p className="font-bold text-gray-800">{formatPrice(product.revenue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders Table */}
      {filteredOrders.length > 0 ? (
        <DataTable
          data={filteredOrders}
          columns={columns}
          pagination={true}
          itemsPerPage={itemsPerPage}
          showSizeChanger={true}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          onPageSizeChange={setItemsPerPage}
        />
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">No orders found for the selected period</p>
        </div>
      )}
    </div>
  );
};

export default SalesReport;

