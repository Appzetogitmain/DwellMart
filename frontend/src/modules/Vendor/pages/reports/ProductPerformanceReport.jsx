import { useState, useMemo, useEffect } from "react";
import { FiPackage, FiTrendingUp, FiTrendingDown } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../../Admin/components/DataTable";
import ExportButton from "../../../Admin/components/ExportButton";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorStore } from "../../store/vendorStore";
import { getVendorOrders } from "../../services/vendorService";

const ProductPerformanceReport = () => {
  const { vendor } = useVendorAuthStore();
  const { getVendorProducts } = useVendorStore();
  const [sortBy, setSortBy] = useState("revenue");
  const [orders, setOrders] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const vendorId = vendor?.id;
  const products = vendorId ? getVendorProducts(vendorId) : [];

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

  const productPerformance = useMemo(() => {
    const performanceMap = {};

    // Initialize with products
    products.forEach((product) => {
      const productId = product.id || product._id;
      performanceMap[productId] = {
        id: productId,
        name: product.name,
        stockQuantity: product.stockQuantity || 0,
        price: product.price || 0,
        orders: 0,
        quantitySold: 0,
        revenue: 0,
        rating: product.rating || 0,
        reviewCount: product.reviewCount || 0,
      };
    });

    // Calculate from orders
    orders.forEach((order) => {
      order.vendorItems?.forEach((vi) => {
        if (vi.vendorId?.toString() === vendorId?.toString()) {
          vi.items?.forEach((item) => {
            const itemId = item.id || item._id || item.productId;
            if (performanceMap[itemId]) {
              performanceMap[itemId].orders += 1;
              performanceMap[itemId].quantitySold += item.quantity || 1;
              performanceMap[itemId].revenue +=
                (item.price || 0) * (item.quantity || 1);
            }
          });
        }
      });
    });

    return Object.values(performanceMap).sort((a, b) => {
      if (sortBy === "revenue") return b.revenue - a.revenue;
      if (sortBy === "quantity") return b.quantitySold - a.quantitySold;
      if (sortBy === "orders") return b.orders - a.orders;
      return b.rating - a.rating;
    });
  }, [products, orders, vendorId, sortBy]);

  const columns = [
    {
      key: "name",
      label: "Product",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">ID: {row.id}</p>
        </div>
      ),
    },
    {
      key: "quantitySold",
      label: "Quantity Sold",
      sortable: true,
      render: (value) => <span className="font-semibold">{value}</span>,
    },
    {
      key: "orders",
      label: "Orders",
      sortable: true,
    },
    {
      key: "revenue",
      label: "Revenue",
      sortable: true,
      render: (value) => (
        <span className="font-bold text-gray-800">{formatPrice(value)}</span>
      ),
    },
    {
      key: "stockQuantity",
      label: "Stock",
      sortable: true,
      render: (value) => (
        <span
          className={
            value < 10 ? "text-red-600 font-semibold" : "text-gray-800"
          }>
          {value}
        </span>
      ),
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (value, row) => (
        <div>
          <span className="font-semibold">{value.toFixed(1)}</span>
          <span className="text-xs text-gray-500 ml-1">
            ({row.reviewCount} reviews)
          </span>
        </div>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Total Products</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">
            {products.length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Total Revenue</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">
            {formatPrice(
              productPerformance.reduce((sum, p) => sum + p.revenue, 0)
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Total Sold</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">
            {productPerformance.reduce((sum, p) => sum + p.quantitySold, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Low Stock Items</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600">
            {productPerformance.filter((p) => p.stockQuantity < 10).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex-1">
            <label className="text-sm font-semibold text-gray-600 mb-2 block">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
              <option value="revenue">Revenue</option>
              <option value="quantity">Quantity Sold</option>
              <option value="orders">Number of Orders</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <div className="flex items-end">
            <ExportButton
              data={productPerformance}
              headers={[
                { label: "Product", accessor: (row) => row.name },
                { label: "Quantity Sold", accessor: (row) => row.quantitySold },
                { label: "Orders", accessor: (row) => row.orders },
                {
                  label: "Revenue",
                  accessor: (row) => formatPrice(row.revenue),
                },
                { label: "Stock", accessor: (row) => row.stockQuantity },
                { label: "Rating", accessor: (row) => row.rating.toFixed(1) },
              ]}
              filename="vendor-product-performance"
            />
          </div>
        </div>
      </div>

      {/* Products Table */}
      {productPerformance.length > 0 ? (
        <DataTable
          data={productPerformance}
          columns={columns}
          pagination={true}
          itemsPerPage={itemsPerPage}
          showSizeChanger={true}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          onPageSizeChange={setItemsPerPage}
        />
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">No products found</p>
        </div>
      )}
    </div>
  );
};

export default ProductPerformanceReport;
