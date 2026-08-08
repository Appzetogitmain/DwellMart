import { useEffect, useMemo, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../components/AnimatedSelect";
import { assignDeliveryBoy, getAllDeliveryBoys, getAllOrders } from "../../services/adminService";
import { formatCurrency } from "../../utils/adminHelpers";

import toast from "react-hot-toast";

const ASSIGNABLE_STATUSES = ["pending", "processing", "confirmed", "packed", "shipped", "dispatched", "out_for_delivery"];

const AssignDelivery = () => {
  const [orders, setOrders] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [statusFilter, setStatusFilter] = useState("unassigned");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    pages: 1,
  });
  const itemsPerPage = 20;

  const fetchAllActiveDeliveryBoys = async () => {
    const first = await getAllDeliveryBoys({
      page: 1,
      limit: 100,
      status: "active",
      applicationStatus: "approved",
    });
    const firstRows = first?.data?.deliveryBoys || [];
    const totalPages = Number(first?.data?.pagination?.pages || 1);
    if (totalPages <= 1) return firstRows;

    const requests = [];
    for (let page = 2; page <= totalPages; page += 1) {
      requests.push(
        getAllDeliveryBoys({
          page,
          limit: 100,
          status: "active",
          applicationStatus: "approved",
        })
      );
    }
    const results = await Promise.all(requests);
    return firstRows.concat(results.flatMap((res) => res?.data?.deliveryBoys || []));
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const orderParams = {
        page: currentPage,
        limit: itemsPerPage,
        assignableOnly: true,
      };
      if (statusFilter === "unassigned") {
        orderParams.onlyUnassigned = true;
      } else if (statusFilter !== "all") {
        orderParams.status = statusFilter;
      }

      const [ordersRes, boyRows] = await Promise.all([
        getAllOrders(orderParams),
        fetchAllActiveDeliveryBoys(),
      ]);

      const orderRows = ordersRes?.data?.orders || [];

      setOrders(orderRows);
      setPagination({
        total: Number(ordersRes?.data?.total || 0),
        page: Number(ordersRes?.data?.page || 1),
        limit: itemsPerPage,
        pages: Number(ordersRes?.data?.pages || 1),
      });
      setDeliveryBoys(boyRows);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const assignableOrders = useMemo(() => {
    return orders.filter((order) =>
      ASSIGNABLE_STATUSES.includes(String(order.status || "").toLowerCase())
    );
  }, [orders]);

  const handleOpenAssign = (order) => {
    setSelectedOrder(order);
    const existingBoyId = order?.deliveryBoyId?._id || order?.deliveryBoyId || "";
    setSelectedDeliveryBoyId(String(existingBoyId));
  };

  const handleAssign = async () => {
    if (!selectedOrder || !selectedDeliveryBoyId) return;
    setIsAssigning(true);
    try {
      const res = await assignDeliveryBoy(selectedOrder.orderId || selectedOrder._id, selectedDeliveryBoyId);
      const updatedOrder = res?.data || res?.order || res;

      const chosenBoy = deliveryBoys.find((b) => String(b.id || b._id) === String(selectedDeliveryBoyId));
      const populatedBoy = (updatedOrder && typeof updatedOrder.deliveryBoyId === "object" && updatedOrder.deliveryBoyId?.name)
        ? updatedOrder.deliveryBoyId
        : (chosenBoy ? { _id: chosenBoy.id || chosenBoy._id, name: chosenBoy.name, phone: chosenBoy.phone } : { name: "Assigned Partner" });

      const finalOrder = {
        ...selectedOrder,
        ...(updatedOrder || {}),
        deliveryBoyId: populatedBoy,
        status: updatedOrder?.status || (selectedOrder.status === "pending" ? "processing" : selectedOrder.status),
      };

      setOrders((prev) =>
        prev.map((o) =>
          (o._id === selectedOrder._id || o.orderId === selectedOrder.orderId)
            ? finalOrder
            : o
        )
      );

      toast.success("✓ Delivery partner assigned successfully");
      setSelectedOrder(null);
      setSelectedDeliveryBoyId("");

      fetchData();
    } catch (err) {
      toast.error("✕ Failed to assign delivery partner");
    } finally {
      setIsAssigning(false);
    }
  };

  const columns = [
    {
      key: "orderId",
      label: "Order",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value || row._id}</p>
          <p className="text-xs text-gray-500">{row?.shippingAddress?.name || "N/A"}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => <Badge variant={value}>{String(value || "pending").toUpperCase()}</Badge>,
    },
    {
      key: "total",
      label: "Amount",
      sortable: true,
      render: (value) => <span className="font-semibold text-gray-800">{formatCurrency(value || 0)}</span>,
    },
    {
      key: "deliveryBoyId",
      label: "Assigned To",
      sortable: false,
      render: (value) => {
        const name = typeof value === "object" && value?.name ? value.name : "Unassigned";
        const phone = typeof value === "object" && value?.phone ? value.phone : "";
        return (
          <div>
            <p className="font-medium text-gray-800">{name}</p>
            {phone ? <p className="text-xs text-gray-500">{phone}</p> : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "Action",
      sortable: false,
      render: (_, row) => {
        const hasRider = Boolean(row.deliveryBoyId && (typeof row.deliveryBoyId === "object" ? row.deliveryBoyId.name || row.deliveryBoyId._id : row.deliveryBoyId));
        return (
          <button
            onClick={() => handleOpenAssign(row)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
          >
            {hasRider ? "Reassign" : "Assign"}
          </button>
        );
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Assign Delivery</h1>
        <p className="text-sm sm:text-base text-gray-600">Assign or reassign orders to delivery partners</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "unassigned", label: "Unassigned Orders (Needs Rider)" },
              { value: "all", label: "All Orders (Assigned & Unassigned)" },
              { value: "pending", label: "Pending" },
              { value: "processing", label: "Processing" },
              { value: "shipped", label: "Shipped" },
            ]}
          />
          <div className="sm:col-span-2 flex justify-start sm:justify-end">
            <button
              onClick={fetchData}
              className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm flex items-center gap-2"
            >
              <FiRefreshCw />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading assignment data...</p>
          </div>
        ) : (
          <>
            <DataTable data={assignableOrders} columns={columns} pagination={false} />
            <Pagination
              currentPage={pagination.page || currentPage}
              totalPages={pagination.pages || 1}
              totalItems={pagination.total || 0}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              className="mt-6"
            />
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[10000]"
              onClick={() => {
                if (isAssigning) return;
                setSelectedOrder(null);
                setSelectedDeliveryBoyId("");
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none"
            >
              <motion.div
                initial={{ y: 20, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.98 }}
                className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 pointer-events-auto"
              >
                <h3 className="text-lg font-bold text-gray-800 mb-2">
                  {selectedOrder?.deliveryBoyId ? "Reassign Delivery" : "Assign Delivery"}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Choose a delivery partner for order{" "}
                  <span className="font-semibold text-gray-800">{selectedOrder?.orderId || selectedOrder?._id}</span>.
                </p>
                <AnimatedSelect
                  name="deliveryBoyId"
                  value={selectedDeliveryBoyId}
                  onChange={(e) => setSelectedDeliveryBoyId(e.target.value)}
                  options={[
                    { value: "", label: "Select Delivery Boy" },
                    ...deliveryBoys.map((boy) => ({
                      value: String(boy.id || boy._id),
                      label: `${boy.name} (${boy.phone || "N/A"})`,
                    })),
                  ]}
                />
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrder(null);
                      setSelectedDeliveryBoyId("");
                    }}
                    disabled={isAssigning}
                    className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold text-sm disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAssign}
                    disabled={isAssigning || !selectedDeliveryBoyId}
                    className="px-4 py-2 rounded-lg gradient-green text-white font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isAssigning ? "Assigning..." : "Confirm"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AssignDelivery;
