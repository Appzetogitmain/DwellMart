import { useState, useEffect, useMemo } from 'react';
import { FiPackage, FiAlertCircle, FiTrendingDown } from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from '../../components/DataTable';
import ExportButton from '../../components/ExportButton';
import { formatPrice, getPlaceholderImage } from '../../../../shared/utils/helpers';
import * as adminService from '../../services/adminService';

const InventoryReport = () => {
  const PRODUCT_IMAGE_PLACEHOLDER = getPlaceholderImage(50, 50, 'Product');
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({ totalProducts: 0, activeProducts: 0, lowStock: 0, outOfStock: 0, totalValue: 0 });
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchAllProducts = async () => {
      setProductsLoading(true);
      try {
        const allProducts = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await adminService.getInventoryReport({ page, limit: 200 });
          const payload = response?.data || {};
          allProducts.push(...(payload.products || []));
          if (page === 1) {
            setSummary(payload.summary || { totalProducts: 0, activeProducts: 0, lowStock: 0, outOfStock: 0, totalValue: 0 });
          }
          totalPages = payload.pages || 1;
          page += 1;
        }

        if (mounted) {
          setProducts(
            allProducts.map((p) => ({
              ...p,
              id: p._id || p.id,
              stockQuantity: p.stockQuantity || 0,
              price: p.price || 0,
              image: p.image || p.images?.[0] || PRODUCT_IMAGE_PLACEHOLDER,
            }))
          );
        }
      } finally {
        if (mounted) setProductsLoading(false);
      }
    };

    fetchAllProducts();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const inStock = products.filter(p => (p.stockQuantity || 0) > 5).length;
    return { ...summary, inStock };
  }, [products, summary]);

  const lowStockProducts = useMemo(() =>
    products.filter(p => (p.stockQuantity || 0) <= 5 || p.stock === 'low_stock' || p.stock === 'out_of_stock'),
    [products]);

  const columns = [
    {
      key: 'name',
      label: 'Product',
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={row.image}
            alt={value}
            className="w-10 h-10 object-cover rounded-lg"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
            }}
          />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: 'stockQuantity',
      label: 'Stock',
      sortable: true,
      render: (value) => (value || 0).toLocaleString(),
    },
    {
      key: 'stockStatus',
      label: 'Status',
      sortable: true,
      render: (_, row) => {
        const qty = row.stockQuantity || 0;
        const status = qty === 0 ? 'OUT_OF_STOCK' : qty <= 5 ? 'LOW_STOCK' : 'IN_STOCK';
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${status === 'IN_STOCK' ? 'bg-green-100 text-green-800' :
            status === 'LOW_STOCK' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
            {status.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: 'totalValue',
      label: 'Total Value',
      sortable: true,
      render: (_, row) => formatPrice((row.price || 0) * (row.stockQuantity || 0)),
    },
  ];

  if (productsLoading && products.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Inventory Report</h1>
        <p className="text-sm sm:text-base text-gray-600">View inventory status and analytics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Products</p>
            <FiPackage className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalProducts || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Active Products</p>
            <FiPackage className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.activeProducts || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Low Stock / Out</p>
            <FiAlertCircle className="text-yellow-600" />
          </div>
          <p className="text-2xl font-bold text-yellow-600">{stats.lowStock || 0} / {stats.outOfStock || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Inventory Value</p>
            <FiTrendingDown className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatPrice(stats.totalValue || 0)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex justify-end">
          <ExportButton
            data={products}
            headers={[
              { label: 'Product Name', accessor: (row) => row.name },
              { label: 'Stock', accessor: (row) => row.stockQuantity },
              { label: 'Price', accessor: (row) => formatPrice(row.price) },
            ]}
            filename="inventory-report"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Low Stock Alert</h3>
        {lowStockProducts.length > 0 ? (
          <DataTable
            data={lowStockProducts}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        ) : (
          <p className="text-gray-500 text-center py-8">No low stock products</p>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">All Products</h3>
        <DataTable
          data={products}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      </div>
    </motion.div>
  );
};

export default InventoryReport;

