import { useState, useMemo, useEffect, useCallback } from "react";
import {
  FiFileText,
  FiLoader,
  FiAlertCircle,
  FiUsers,
  FiShoppingBag,
  FiDollarSign,
  FiPercent,
  FiCheckCircle,
} from "react-icons/fi";
import { motion } from "framer-motion";
import TaxTrendsChart from "../../components/Analytics/TaxTrendsChart";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import { formatPrice } from "../../../../shared/utils/helpers";
import {
  getSalesReport,
  getTdsReport,
  getVendors,
  getCustomers,
} from "../../services/adminService";
import toast from "react-hot-toast";

const TaxReports = () => {
  // Report Type: 'gst' | 'tds'
  const [reportType, setReportType] = useState("gst");

  // ─── GST Summary State ────────────────────────────────────────────────────────
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  // ─── TDS Report State ──────────────────────────────────────────────────────────
  const [tdsView, setTdsView] = useState("vendor"); // 'vendor' | 'user'
  const [tdsDateRange, setTdsDateRange] = useState({ start: "", end: "" });
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [appliedTdsFilters, setAppliedTdsFilters] = useState({
    start: "",
    end: "",
    vendorId: "",
    userId: "",
    view: "vendor",
  });
  const [tdsSummary, setTdsSummary] = useState({
    totalTaxableAmount: 0,
    totalGstAmount: 0,
    totalTdsAmount: null,
    netPayable: 0,
    totalOrders: 0,
    tdsConfigured: false,
    configuredTdsRate: null,
  });
  const [tdsItems, setTdsItems] = useState([]);
  const [tdsLoading, setTdsLoading] = useState(false);
  const [tdsPageSize, setTdsPageSize] = useState(10);

  // Dropdown options
  const [vendorsList, setVendorsList] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Fetch initial orders for GST Summary
  useEffect(() => {
    let mounted = true;

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const allOrders = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await getSalesReport({
            page,
            limit: 200,
            status: "delivered",
          });
          const payload = response?.data || {};
          allOrders.push(...(payload.orders || []));
          totalPages = payload.pages || 1;
          page += 1;
        }

        if (mounted) setOrders(allOrders);
      } catch (err) {
        console.error("Error fetching GST report orders:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchOrders();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch TDS Report Data
  const fetchTdsData = useCallback(async (filters = {}) => {
    setTdsLoading(true);
    try {
      const activeView = filters.view || tdsView;
      const params = {
        view: activeView,
        startDate: filters.start || "",
        endDate: filters.end || "",
        vendorId: filters.vendorId || "",
        userId: filters.userId || "",
        limit: 500, // Load current filtered set for responsive client-side pagination
      };
      const res = await getTdsReport(params);
      const payload = res?.data || {};

      setTdsSummary(
        payload.summary || {
          totalTaxableAmount: 0,
          totalGstAmount: 0,
          totalTdsAmount: null,
          netPayable: 0,
          totalOrders: 0,
          tdsConfigured: false,
          configuredTdsRate: null,
        }
      );
      setTdsItems(payload.items || []);
    } catch (error) {
      console.error("Error fetching TDS report:", error);
      toast.error("Failed to fetch TDS report");
    } finally {
      setTdsLoading(false);
    }
  }, [tdsView]);

  // Load vendors and users for dropdowns when switching to TDS
  useEffect(() => {
    if (reportType === "tds") {
      if (vendorsList.length === 0) {
        getVendors({ limit: 100 })
          .then((res) => {
            const list = res?.data?.vendors || [];
            setVendorsList(list);
          })
          .catch((err) => console.error("Failed to load vendors for filter:", err));
      }

      if (usersList.length === 0) {
        getCustomers({ limit: 100 })
          .then((res) => {
            const list = res?.data?.customers || [];
            setUsersList(list);
          })
          .catch((err) => console.error("Failed to load users for filter:", err));
      }

      fetchTdsData(appliedTdsFilters);
    }
  }, [reportType, fetchTdsData]);

  // Apply TDS filter button handler
  const handleApplyTdsFilter = () => {
    const nextFilters = {
      start: tdsDateRange.start,
      end: tdsDateRange.end,
      vendorId: selectedVendor,
      userId: selectedUser,
      view: tdsView,
    };
    setAppliedTdsFilters(nextFilters);
    fetchTdsData(nextFilters);
  };

  // Toggle view between vendor and user
  const handleToggleTdsView = (newView) => {
    setTdsView(newView);
    const nextFilters = {
      ...appliedTdsFilters,
      view: newView,
    };
    setAppliedTdsFilters(nextFilters);
    fetchTdsData(nextFilters);
  };

  // ─── GST Summary Calculations ────────────────────────────────────────────────
  const taxData = useMemo(() => {
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
        taxRate:
          day.total > 0
            ? Number(((day.taxAmount / day.total) * 100).toFixed(2))
            : 0,
        count: day.count,
      }));

    const sortedTableData = tableData.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

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

  const gstColumns = [
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

  // ─── TDS Columns ─────────────────────────────────────────────────────────────
  const vendorTdsColumns = [
    {
      key: "vendorName",
      label: "Vendor Name",
      sortable: true,
      render: (val, row) => (
        <div>
          <div className="font-semibold text-gray-800">{val || "Unknown Vendor"}</div>
          <div className="text-[11px] text-gray-500 font-mono">
            ID: {row.vendorId ? String(row.vendorId).substring(0, 10) : "N/A"}
          </div>
        </div>
      ),
    },
    {
      key: "gstin",
      label: "GSTIN",
      sortable: true,
      render: (val) => (
        <span
          className={
            val && val !== "N/A"
              ? "font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded"
              : "text-gray-400 italic text-xs"
          }
        >
          {val || "N/A"}
        </span>
      ),
    },
    {
      key: "orderCount",
      label: "Orders",
      sortable: true,
      render: (val) => <span className="font-medium text-gray-700">{val || 0}</span>,
    },
    {
      key: "taxableAmount",
      label: "Taxable Amount",
      sortable: true,
      render: (val) => (
        <span className="font-semibold text-gray-800">{formatPrice(val || 0)}</span>
      ),
    },
    {
      key: "gstAmount",
      label: "GST Amount",
      sortable: true,
      render: (val) => (
        <span className="font-semibold text-blue-600">{formatPrice(val || 0)}</span>
      ),
    },
    {
      key: "tdsRate",
      label: "TDS Rate",
      render: (val) =>
        val ? (
          <span className="font-medium text-gray-700">{val}</span>
        ) : (
          <span className="text-gray-400 italic text-xs">Not Configured</span>
        ),
    },
    {
      key: "tdsAmount",
      label: "TDS Amount",
      sortable: true,
      render: (val) =>
        val != null ? (
          <span className="font-semibold text-purple-600">
            {formatPrice(val)}
          </span>
        ) : (
          <span className="text-gray-400 italic text-xs">—</span>
        ),
    },
    {
      key: "netPayable",
      label: "Net Payable",
      sortable: true,
      render: (val) => (
        <span className="font-bold text-green-700">{formatPrice(val || 0)}</span>
      ),
    },
  ];

  const userTdsColumns = [
    {
      key: "customerName",
      label: "Customer Name",
      sortable: true,
      render: (val, row) => (
        <div>
          <div className="font-semibold text-gray-800">
            {val || "Guest Customer"}
          </div>
          <div className="text-[11px] text-gray-500">
            {row.customerEmail || row.customerPhone || "N/A"}
          </div>
        </div>
      ),
    },
    {
      key: "gstin",
      label: "GSTIN",
      render: (val) => (
        <span className="text-gray-400 italic text-xs">
          {val || "N/A (B2C)"}
        </span>
      ),
    },
    {
      key: "orderCount",
      label: "Orders",
      sortable: true,
      render: (val) => <span className="font-medium text-gray-700">{val || 0}</span>,
    },
    {
      key: "taxableAmount",
      label: "Taxable Amount",
      sortable: true,
      render: (val) => (
        <span className="font-semibold text-gray-800">{formatPrice(val || 0)}</span>
      ),
    },
    {
      key: "gstAmount",
      label: "GST Amount",
      sortable: true,
      render: (val) => (
        <span className="font-semibold text-blue-600">{formatPrice(val || 0)}</span>
      ),
    },
    {
      key: "tdsRate",
      label: "TDS Rate",
      render: (val) =>
        val ? (
          <span className="font-medium text-gray-700">{val}</span>
        ) : (
          <span className="text-gray-400 italic text-xs">Not Configured</span>
        ),
    },
    {
      key: "tdsAmount",
      label: "TDS Amount",
      sortable: true,
      render: (val) =>
        val != null ? (
          <span className="font-semibold text-purple-600">
            {formatPrice(val)}
          </span>
        ) : (
          <span className="text-gray-400 italic text-xs">—</span>
        ),
    },
    {
      key: "netPayable",
      label: "Net Payable",
      sortable: true,
      render: (val) => (
        <span className="font-bold text-green-700">{formatPrice(val || 0)}</span>
      ),
    },
  ];

  return isLoading && orders.length === 0 ? (
    <div className="flex items-center justify-center min-h-[320px]">
      <FiLoader className="animate-spin text-3xl text-primary-600" />
    </div>
  ) : (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header & Report Type Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
            Tax & TDS Reports
          </h1>
          <p className="text-sm text-gray-600">
            Monitor GST collection, taxable baselines, and TDS billing records
          </p>
        </div>

        {/* Report Type Switcher Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200">
          <button
            type="button"
            onClick={() => setReportType("gst")}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              reportType === "gst"
                ? "bg-white text-gray-900 shadow-sm font-bold"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            GST Summary
          </button>
          <button
            type="button"
            onClick={() => setReportType("tds")}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              reportType === "tds"
                ? "bg-white text-gray-900 shadow-sm font-bold"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            TDS Report
          </button>
        </div>
      </div>

      {/* ─── GST SUMMARY REPORT VIEW ────────────────────────────────────────── */}
      {reportType === "gst" && (
        <div className="space-y-6">
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
                    {
                      label: "Date",
                      accessor: (row) => new Date(row.date).toLocaleString(),
                    },
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
              columns={gstColumns}
              pagination={true}
              itemsPerPage={10}
            />
          </div>
        </div>
      )}

      {/* ─── TDS REPORT VIEW ────────────────────────────────────────────────── */}
      {reportType === "tds" && (
        <div className="space-y-6">
          {/* TDS Filters Card */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={tdsDateRange.start}
                  onChange={(e) =>
                    setTdsDateRange({ ...tdsDateRange, start: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={tdsDateRange.end}
                  onChange={(e) =>
                    setTdsDateRange({ ...tdsDateRange, end: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Vendor
                </label>
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All Vendors</option>
                  {vendorsList.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.storeName || v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  User / Customer
                </label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All Users</option>
                  {usersList.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} {u.phone ? `(${u.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleApplyTdsFilter}
                  className="w-full px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors shadow-xs"
                >
                  Apply Filter
                </button>
              </div>

              <div>
                <ExportButton
                  data={tdsItems}
                  headers={
                    tdsView === "vendor"
                      ? [
                          { label: "Vendor Name", accessor: (row) => row.vendorName },
                          { label: "Vendor ID", accessor: (row) => row.vendorId || row._id },
                          { label: "GSTIN", accessor: (row) => row.gstin || "N/A" },
                          { label: "Orders Count", accessor: (row) => row.orderCount || 0 },
                          {
                            label: "Taxable Amount",
                            accessor: (row) => formatPrice(row.taxableAmount),
                          },
                          {
                            label: "GST Amount",
                            accessor: (row) => formatPrice(row.gstAmount),
                          },
                          {
                            label: "TDS Rate",
                            accessor: (row) => row.tdsRate || "Not Configured",
                          },
                          {
                            label: "TDS Amount",
                            accessor: (row) =>
                              row.tdsAmount != null
                                ? formatPrice(row.tdsAmount)
                                : "N/A",
                          },
                          {
                            label: "Net Payable",
                            accessor: (row) => formatPrice(row.netPayable),
                          },
                        ]
                      : [
                          {
                            label: "Customer Name",
                            accessor: (row) => row.customerName,
                          },
                          { label: "Customer ID", accessor: (row) => row.userId || row._id },
                          {
                            label: "Customer Email",
                            accessor: (row) => row.customerEmail || "N/A",
                          },
                          {
                            label: "Customer Phone",
                            accessor: (row) => row.customerPhone || "N/A",
                          },
                          { label: "GSTIN", accessor: () => "N/A" },
                          { label: "Orders Count", accessor: (row) => row.orderCount || 0 },
                          {
                            label: "Taxable Amount",
                            accessor: (row) => formatPrice(row.taxableAmount),
                          },
                          {
                            label: "GST Amount",
                            accessor: (row) => formatPrice(row.gstAmount),
                          },
                          {
                            label: "TDS Rate",
                            accessor: (row) => row.tdsRate || "Not Configured",
                          },
                          {
                            label: "TDS Amount",
                            accessor: (row) =>
                              row.tdsAmount != null
                                ? formatPrice(row.tdsAmount)
                                : "N/A",
                          },
                          {
                            label: "Net Payable",
                            accessor: (row) => formatPrice(row.netPayable),
                          },
                        ]
                  }
                  filename={`tds-report-${tdsView}`}
                />
              </div>
            </div>
          </div>

          {/* TDS Rate Missing / Configured Notice */}
          {!tdsSummary.tdsConfigured ? (
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
              <FiAlertCircle className="text-amber-600 w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">
                  TDS Rate Configuration Notice
                </p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  No TDS rate is configured in system settings. GST billing and taxable amounts are accurately aggregated from verified delivered orders below. TDS amounts and statutory deductions will calculate automatically once a TDS rate is established in platform settings.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-xs sm:text-sm text-green-900 flex items-start gap-3">
              <FiCheckCircle className="text-green-600 w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-green-950">
                  TDS Configured at {tdsSummary.configuredTdsRate}%
                </p>
                <p className="mt-0.5 text-green-800 leading-relaxed">
                  TDS is being computed against taxable bases at the established platform rate of {tdsSummary.configuredTdsRate}%.
                </p>
              </div>
            </div>
          )}

          {/* TDS Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Taxable Amount
                </p>
                <FiDollarSign className="text-blue-600 text-lg" />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {formatPrice(tdsSummary.totalTaxableAmount || 0)}
              </p>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total GST
                </p>
                <FiPercent className="text-purple-600 text-lg" />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {formatPrice(tdsSummary.totalGstAmount || 0)}
              </p>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total TDS
                </p>
                <FiAlertCircle className="text-amber-600 text-lg" />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {tdsSummary.tdsConfigured
                  ? formatPrice(tdsSummary.totalTdsAmount || 0)
                  : "—"}
              </p>
              {!tdsSummary.tdsConfigured && (
                <span className="text-[11px] text-amber-700 font-medium">
                  Not Configured
                </span>
              )}
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Net Payable
                </p>
                <FiCheckCircle className="text-green-600 text-lg" />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {formatPrice(tdsSummary.netPayable || 0)}
              </p>
            </div>
          </div>

          {/* View Toggle Tabs (Vendor-wise vs User-wise) */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <button
              type="button"
              onClick={() => handleToggleTdsView("vendor")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                tdsView === "vendor"
                  ? "bg-primary-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <FiShoppingBag />
              Vendor Wise
            </button>
            <button
              type="button"
              onClick={() => handleToggleTdsView("user")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                tdsView === "user"
                  ? "bg-primary-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <FiUsers />
              User Wise
            </button>
          </div>

          {/* TDS Table Card */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            {tdsLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                <FiLoader className="animate-spin text-3xl text-primary-600 mb-2" />
                <p className="text-sm">Loading TDS records...</p>
              </div>
            ) : tdsItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-gray-400">
                <FiFileText className="w-12 h-12 text-gray-300 mb-2" />
                <p className="text-base font-semibold text-gray-700">
                  No TDS records found for the selected period.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Try adjusting the date range or removing vendor/user filters.
                </p>
              </div>
            ) : (
              <DataTable
                data={tdsItems}
                columns={tdsView === "vendor" ? vendorTdsColumns : userTdsColumns}
                pagination={true}
                itemsPerPage={tdsPageSize}
                showSizeChanger={true}
                onPageSizeChange={(newSize) => setTdsPageSize(newSize)}
                pageSizeOptions={[10, 25, 50, 100, "All"]}
              />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TaxReports;
