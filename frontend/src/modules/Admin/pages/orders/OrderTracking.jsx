import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiSearch,
  FiMapPin,
  FiTruck,
  FiPackage,
  FiCheckCircle,
} from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import Badge from "../../../../shared/components/Badge";
// import { formatDateTime } from '../../utils/adminHelpers';
import { getAllOrders } from "../../services/adminService";

const OrderTracking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const response = await getAllOrders({ limit: 100 });
        const normalizedOrders = response.data.orders.map(order => ({
          ...order,
          id: order.orderId || order._id,
          customer: {
            name: order.userId?.name || 'Unknown',
            email: order.userId?.email || ''
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

  const filteredOrders = orders.filter(
    (order) =>
      (order.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customer?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (!orderId || orders.length === 0) return;
    const matched = orders.find((o) => o.id === orderId);
    if (matched) {
      setSelectedOrder(matched);
      setSearchQuery(orderId);
    }
  }, [orders, searchParams]);

  const getTrackingSteps = (status) => {
    const steps = [
      { label: "Order Placed", status: "completed", icon: FiCheckCircle },
      {
        label: "Processing",
        status:
          status === "processing" ||
            status === "shipped" ||
            status === "delivered"
            ? "completed"
            : "pending",
        icon: FiPackage,
      },
      {
        label: "Shipped",
        status:
          status === "shipped" || status === "delivered"
            ? "completed"
            : "pending",
        icon: FiTruck,
      },
      {
        label: "Delivered",
        status: status === "delivered" ? "completed" : "pending",
        icon: FiMapPin,
      },
    ];
    return steps;
  };

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
          onClick={() => setSelectedOrder(row)}
          className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold">
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
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={selectedOrder ? "lg:col-span-2" : "lg:col-span-3"}>
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
        </div>

        {selectedOrder && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Tracking Details
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Customer</p>
                <p className="font-semibold text-gray-800">
                  {selectedOrder.customer.name}
                </p>
              </div>
              <div className="space-y-3 pt-4 border-t border-gray-200">
                {getTrackingSteps(selectedOrder.status).map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={index} className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${step.status === "completed"
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-400"
                          }`}>
                        <Icon className="text-sm" />
                      </div>
                      <div className="flex-1">
                        <p
                          className={`font-medium ${step.status === "completed"
                              ? "text-gray-800"
                              : "text-gray-400"
                            }`}>
                          {step.label}
                        </p>
                        {step.status === "completed" && (
                          <p className="text-xs text-gray-500 mt-1">
                            Completed
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => navigate(`/admin/orders/${selectedOrder.id}`)}
                className="w-full mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold">
                View Full Details
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default OrderTracking;
