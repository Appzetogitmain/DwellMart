import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiEdit, FiTrash2 } from "react-icons/fi";
import { motion } from "framer-motion";
import { DashboardPage, DataTable, StatusBadge } from "../../../../shared/components/Dashboard";
import { Button, Badge, Card, Select } from "../../../../shared/components/ui";
import ExportButton from "../../../Admin/components/ExportButton";
import ConfirmModal from "../../../Admin/components/ConfirmModal";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice, getPlaceholderImage, getImageUrl } from "../../../../shared/utils/helpers";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorProductStore } from "../../store/vendorProductStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import { exportVendorProductsCatalog } from "../../services/vendorService";
import api from "../../../../shared/utils/api";

import BulkUploadModal from "../../../../shared/components/BulkUploadModal";
import ImportHistoryModal from "../../../../shared/components/ImportHistoryModal";
import { FiDownload, FiUploadCloud, FiList } from "react-icons/fi";

const ManageProducts = () => {
  const PRODUCT_IMAGE_PLACEHOLDER = getPlaceholderImage(50, 50, "Product");
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { products, isLoading, fetchProducts, removeProduct } = useVendorProductStore();
  const { categories, initialize: initCategories } = useCategoryStore();
  const { settings, initialize: initSettings } = useSettingsStore();
  const wholesaleMarketplaceEnabled =
    settings?.features?.wholesaleMarketplaceEnabled === true;

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    productId: null,
  });

  const vendorId = vendor?.id;

  useEffect(() => {
    initCategories();
    initSettings();
    if (vendorId) {
      fetchProducts({ fetchAll: true, limit: 200 });
    }
  }, [vendorId, initCategories, initSettings, fetchProducts]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((product) => product.stock === selectedStatus);
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (product) =>
          String(product.categoryId?._id ?? product.categoryId ?? "") ===
          selectedCategory
      );
    }

    if (selectedChannel === "retail") {
      filtered = filtered.filter((product) => product.retailEnabled !== false);
    } else if (selectedChannel === "wholesale") {
      filtered = filtered.filter((product) => product.wholesaleEnabled === true);
    }

    return filtered;
  }, [products, searchQuery, selectedStatus, selectedCategory, selectedChannel]);

  const handleActionClick = (targetPath) => {
    api.get('/vendor/subscription')
      .then((res) => {
        const data = res?.data;
        if (!data?.hasSubscription || !data?.isActive) {
          window.dispatchEvent(new CustomEvent('vendor-subscription-expired', {
            detail: { message: 'Your subscription has expired. Please resubscribe to add or edit products.' }
          }));
        }
        navigate(targetPath);
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent('vendor-subscription-expired', {
          detail: { message: 'Your subscription has expired. Please resubscribe to add or edit products.' }
        }));
        navigate(targetPath);
      });
  };

  const columns = [
    {
      key: "_id",
      label: "ID",
      sortable: true,
      render: (value) => String(value).slice(-6).toUpperCase(),
    },
    {
      key: "name",
      label: "Product Name",
      sortable: true,
      render: (value, row) => {
        const imgSrc = getImageUrl(row.image || row.images?.[0], PRODUCT_IMAGE_PLACEHOLDER);
        return (
          <div className="flex items-center gap-3">
            <img
              src={imgSrc}
              alt={value}
              className="w-10 h-10 object-cover rounded-lg"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
              }}
            />
            <span className="font-medium">{value}</span>
          </div>
        );
      },
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "stockQuantity",
      label: "Stock",
      sortable: true,
      render: (value) => value?.toLocaleString() || 0,
    },
    {
      key: "stock",
      title: "Status",
      sortable: true,
      render: (value) => (
        <StatusBadge
          status={value === "in_stock" ? "active" : value === "low_stock" ? "pending" : "out_of_stock"}
        />
      ),
    },
    ...(wholesaleMarketplaceEnabled
      ? [
          {
            key: "wholesaleEnabled",
            label: "Channels",
            sortable: false,
            render: (_, row) => {
              const retail = row.retailEnabled !== false;
              const wholesale = row.wholesaleEnabled === true;
              return (
                <div className="flex flex-wrap items-center gap-1">
                  {retail && <Badge variant="info">Retail</Badge>}
                  {wholesale && <Badge variant="success">Wholesale</Badge>}
                </div>
              );
            },
          },
        ]
      : []),
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleActionClick(`/vendor/products/${row._id ?? row.id}`);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <FiEdit />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteModal({ isOpen: true, productId: row._id ?? row.id });
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  const confirmDelete = async () => {
    const success = await removeProduct(deleteModal.productId);
    if (success) {
      setDeleteModal({ isOpen: false, productId: null });
    }
  };

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to manage products</p>
      </div>
    );
  }

  return (
    <DashboardPage
      title="Manage Products"
      subtitle="View, edit, and manage your product catalog"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportVendorProductsCatalog('xlsx')}
            leftIcon={<FiDownload />}
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsHistoryModalOpen(true)}
            leftIcon={<FiList />}
          >
            History
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsBulkModalOpen(true)}
            leftIcon={<FiUploadCloud />}
          >
            Bulk Upload
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleActionClick("/vendor/products/add-product")}
          >
            Add New Product
          </Button>
        </div>
      }
    >
      {wholesaleMarketplaceEnabled && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <label
            htmlFor="channel-filter"
            className="text-sm font-semibold text-gray-700"
          >
            Selling Channel
          </label>
          <div className="w-full sm:w-56">
            <AnimatedSelect
              name="channel-filter"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              options={[
                { value: "all", label: "All Channels" },
                { value: "retail", label: "Retail" },
                { value: "wholesale", label: "Wholesale" },
              ]}
            />
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredProducts}
        loading={isLoading}
        searchable={true}
        searchPlaceholder="Search products..."
        emptyTitle="No products found"
        emptyDescription="Get started by adding your first product to your catalog."
      />

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, productId: null })}
        onConfirm={confirmDelete}
        title="Delete Product?"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        mode="vendor"
        onSuccess={() => fetchProducts({ fetchAll: true, limit: 200 })}
      />

      <ImportHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        mode="vendor"
      />
    </DashboardPage>
  );
};

export default ManageProducts;
