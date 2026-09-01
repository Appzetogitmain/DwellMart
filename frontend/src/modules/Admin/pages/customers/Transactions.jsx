import { useState, useEffect } from "react";
import { FiSearch } from "react-icons/fi";
import { FaCoins } from "react-icons/fa6";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from "../../../../shared/utils/helpers";
import { formatDateTime } from "../../utils/adminHelpers";
import { getCustomerTransactions } from "../../services/adminService";

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    pages: 0,
  });
  const itemsPerPage = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      const loadTransactions = async () => {
        try {
          const response = await getCustomerTransactions({
            page: currentPage,
            limit: itemsPerPage,
            search: searchQuery || undefined,
            status: statusFilter,
          });
          const orders = response?.data?.orders || [];

          const generatedTransactions = orders.flatMap((order) => {
            const orderId = order.orderId || order._id;
            const customerName =
              order.userId?.name || order.shippingAddress?.name || "Guest";
            const customerEmail =
              order.userId?.email || order.shippingAddress?.email || "N/A";
            const amount = Number(order.total) || 0;
            const method = order.paymentMethod || "N/A";
            const createdDate = order.createdAt || new Date().toISOString();

            const paymentStatusMap = {
              paid: "completed",
              pending: "pending",
              failed: "failed",
              refunded: "completed",
            };

            const transactionsForOrder = [
              {
                id: `TXN-${orderId}-PAY`,
                orderId,
                customerName,
                customerEmail,
                amount,
                type: "payment",
                status:
                  paymentStatusMap[order.paymentStatus] ||
                  (order.status === "cancelled" ? "failed" : "completed"),
                method,
                date: createdDate,
              },
            ];

            if (order.paymentStatus === "refunded") {
              transactionsForOrder.push({
                id: `TXN-${orderId}-REF`,
                orderId,
                customerName,
                customerEmail,
                amount,
                type: "refund",
                status: "completed",
                method: "Original Payment Method",
                date: order.updatedAt || createdDate,
              });
            }

            return transactionsForOrder;
          });

          setTransactions(generatedTransactions);
          setPagination(
            response?.data?.pagination || {
              total: generatedTransactions.length,
              page: 1,
              limit: itemsPerPage,
              pages: 1,
            }
          );
        } catch (error) {
          setTransactions([]);
          setPagination({ total: 0, page: 1, limit: itemsPerPage, pages: 0 });
        }
      };

      loadTransactions();
    }, 300);

    return () => clearTimeout(timer);
  }, [currentPage, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const columns = [
    {
      key: "id",
      label: "Transaction ID",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-gray-800">{value}</span>
      ),
    },
    {
      key: "orderId",
      label: "Order ID",
      sortable: true,
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{row.customerEmail}</p>
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-1.5">
          <FaCoins
            className={`text-xs ${
              row.type === "refund" ? "text-red-500" : "text-emerald-500"
            }`}
          />
          <span
            className={`font-bold ${
              row.type === "refund" ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {row.type === "refund" ? "-" : "+"}
            {formatPrice(value)}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            value === "payment"
              ? "bg-blue-100 text-blue-800"
              : "bg-orange-100 text-orange-800"
          }`}
        >
          {value}
        </span>
      ),
    },
    {
      key: "method",
      label: "Payment Method",
      sortable: false,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge variant={value === "completed" ? "success" : "error"}>
          {value}
        </Badge>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => formatDateTime(value),
    },
  ];

  const totalRevenue = transactions
    .filter((t) => t.type === "payment" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalRefunds = transactions
    .filter((t) => t.type === "refund" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Transactions
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          View customer payment and refund transactions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-green-600">
            {formatPrice(totalRevenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Total Refunds</p>
          <p className="text-2xl font-bold text-red-600">
            {formatPrice(totalRefunds)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Net Revenue</p>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(totalRevenue - totalRefunds)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by transaction ID, order ID, or customer..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All Status" },
              { value: "completed", label: "Completed" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
            ]}
            className="min-w-[140px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable data={transactions} columns={columns} pagination={false} />
        <Pagination
          currentPage={pagination.page || currentPage}
          totalPages={pagination.pages || 0}
          totalItems={pagination.total || 0}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          className="mt-6"
        />
      </div>
    </motion.div>
  );
};

export default Transactions;
