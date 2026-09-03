import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiSearch,
} from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import Badge from "../../../../shared/components/Badge";
import { getAllOrders } from "../../services/adminService";

const OrderTracking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const response = await getAllOrders({ limit: 100 });
        const normalizedOrders = (response.data?.orders || []).map(order => ({
          ...order,
          id: order.orderId || order._id,
          customer: {
            name: order.userId?.name || order.shippingAddress?.fullName || 'Guest Customer',
            email: order.userId?.email || order.shippingAddress?.email || ''
          },
          date: order.createdAt
        }));
        setOrders(normalizedOrders);
      } catch (error) {
        console.error("Tracking fetch error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (orderId) {
      navigate(`/admin/orders/${orderId}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const filteredOrders = orders.filter(
    (order) =>
      (order.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customer?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns = [
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (value) => (
        <div>
          <p className="font-medium text-gray-800">{value.name}</p>
          <p className="text-xs text-gray-500">{value.email}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => <Badge variant={value}>{value}</Badge>,
    },
    {
      key: "date",
      label: "Order Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleString(),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => navigate(`/admin/orders/${row.id}`)}
          className="px-4 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold shadow-xs">
          Track
        </button>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Order Tracking
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Track order status and delivery progress
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order ID or customer name..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading orders...</div>
        ) : (
          <DataTable
            data={filteredOrders}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        )}
      </div>
    </motion.div>
  );
};

export default OrderTracking;
