import { useState, useMemo, useEffect } from "react";
import { FiFileText, FiLoader } from "react-icons/fi";
import { motion } from "framer-motion";
import TaxTrendsChart from "../../components/Analytics/TaxTrendsChart";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import { formatPrice } from '../../../../shared/utils/helpers';
import { getSalesReport } from "../../services/adminService";

const TaxReports = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  useEffect(() => {
    let mounted = true;

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const allOrders = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await getSalesReport({ page, limit: 200, status: 'delivered' });
          const payload = response?.data || {};
          allOrders.push(...(payload.orders || []));
          totalPages = payload.pages || 1;
          page += 1;
        }

        if (mounted) setOrders(allOrders);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchOrders();
    return () => {
      mounted = false;
    };
  }, []);

  const taxData = useMemo(() => {
    // Generate tax data from orders and create daily aggregates for better chart visualization
    const dailyData = {};

    orders.forEach((order) => {
      const taxAmount = Number(order.tax) || 0;
      const subtotal = Number(order.subtotal) || 0;
      const total = Number(order.total) || 0;
      const taxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;
      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      const dateKey =
        createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          taxAmount: 0,
          total: 0,
          count: 0,
          orders: [],
        };
      }

      dailyData[dateKey].taxAmount += taxAmount;
      dailyData[dateKey].total += total;
      dailyData[dateKey].count += 1;
      dailyData[dateKey].orders.push({
        orderId: order.orderId || order._id,
        customer:
          order.userId?.name ||
          order.shippingAddress?.name ||
          "Guest Customer",
        subtotal,
        taxRate,
        taxAmount,
        total,
      });
    });

    // Convert to array format for table and add individual order entries
    const tableData = [];
    Object.values(dailyData).forEach((dayData) => {
      dayData.orders.forEach((order) => {
        tableData.push({
          orderId: order.orderId,
          date: dayData.date,
          customer: order.customer,
          subtotal: order.subtotal,
          taxRate: order.taxRate,
          taxAmount: order.taxAmount,
          total: order.total,
        });
      });
    });

    const sortedChartData = Object.values(dailyData)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((day) => ({
        date: day.date,
        taxAmount: Number(day.taxAmount.toFixed(2)),
        total: Number(day.total.toFixed(2)),
        taxRate: day.total > 0 ? Number(((day.taxAmount / day.total) * 100).toFixed(2)) : 0,
        count: day.count,
      }));

    const sortedTableData = tableData.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      chartData: sortedChartData,
      tableData: sortedTableData,
    };
  }, [orders]);

  const filteredTaxData = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return taxData.tableData;
    return taxData.tableData.filter((item) => {
      const itemDate = new Date(item.date);
      const start = dateRange.start ? new Date(dateRange.start) : null;
      const end = dateRange.end ? new Date(dateRange.end) : null;
      return (!start || itemDate >= start) && (!end || itemDate <= end);
    });
  }, [taxData, dateRange]);

  const totalTax = filteredTaxData.reduce(
    (sum, item) => sum + item.taxAmount,
    0
  );
  const totalRevenue = filteredTaxData.reduce(
    (sum, item) => sum + item.total,
    0
  );

  const columns = [
    {
      key: "orderId",
      label: "Order ID",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-gray-800">{value}</span>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleString(),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
    },
    {
      key: "subtotal",
      label: "Subtotal",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "taxRate",
      label: "Tax Rate",
      sortable: true,
      render: (value) => `${Number(value || 0).toFixed(2)}%`,
    },
    {
      key: "taxAmount",
      label: "Tax Amount",
      sortable: true,
      render: (value) => (
        <span className="font-bold text-gray-800">{formatPrice(value)}</span>
      ),
    },
    {
      key: "total",
      label: "Total",
      sortable: true,
      render: (value) => formatPrice(value),
    },
  ];

  return (
    isLoading && orders.length === 0 ? (
      <div className="flex items-center justify-center min-h-[320px]">
        <FiLoader className="animate-spin text-3xl text-primary-600" />
      </div>
    ) : (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Tax Reports
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          View tax collection and reports
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Tax Collected</p>
            <FiFileText className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(totalTax)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Revenue</p>
            <FiFileText className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(totalRevenue)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange({ ...dateRange, start: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-end">
            <ExportButton
              data={filteredTaxData}
              headers={[
                { label: "Order ID", accessor: (row) => row.orderId },
                { label: "Date", accessor: (row) => new Date(row.date).toLocaleString() },
                { label: "Customer", accessor: (row) => row.customer },
                {
                  label: "Subtotal",
                  accessor: (row) => formatPrice(row.subtotal),
                },
                { label: "Tax Rate", accessor: (row) => `${row.taxRate}%` },
                {
                  label: "Tax Amount",
                  accessor: (row) => formatPrice(row.taxAmount),
                },
                {
                  label: "Total",
                  accessor: (row) => formatPrice(row.total),
                },
              ]}
              filename="tax-report"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <TaxTrendsChart taxData={taxData.chartData} dateRange={dateRange} />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={filteredTaxData}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      </div>
    </motion.div>
    )
  );
};

export default TaxReports;
