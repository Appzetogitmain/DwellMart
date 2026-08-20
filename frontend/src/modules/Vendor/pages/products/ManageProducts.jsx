import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiEdit, FiTrash2, FiAlertTriangle } from "react-icons/fi";
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
import { exportVendorProductsCatalog } from "../../services/vendorService";
import { getVendorCapabilities } from "../../../../shared/config/vendorCapabilities";
import { useVendorWorkspace } from '../../hooks/useVendorWorkspace';
import api from "../../../../shared/utils/api";

import BulkUploadModal from "../../../../shared/components/BulkUploadModal";
import ImportHistoryModal from "../../../../shared/components/ImportHistoryModal";
import { FiDownload, FiUploadCloud, FiList } from "react-icons/fi";


/**
 * True when this product would ship at an estimate.
 *
 * A backfilled `source: 'estimated'` counts: seeding made the guess visible,
 * it did not turn it into a measurement.
 */
const needsShippingData = (product) => {
  const courierEligible = product?.retailEnabled !== false || product?.wholesaleEnabled === true;
  if (!courierEligible) return false;
  const weight = Number(product?.shipping?.weight);
  return !(weight > 0) || product?.shipping?.source === 'estimated';
};

const ManageProducts = () => {
  const PRODUCT_IMAGE_PLACEHOLDER = getPlaceholderImage(50, 50, "Product");
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { products, isLoading, fetchProducts, removeProduct } = useVendorProductStore();
  const { categories, initialize: initCategories } = useCategoryStore();

  // ── Capability-driven filter list ──────────────────────────────────────────
  const { workspace } = useVendorWorkspace();
  const vendorType = workspace ?? vendor?.activeWorkspaces?.[0] ?? "retail";
  const caps = getVendorCapabilities(vendorType);
  const activeFilters = caps.productListFilters ?? [];

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  // Extra filter state driven by activeFilters
  const [filterMoq, setFilterMoq] = useState("all");          // wholesale
  const [filterPerishable, setFilterPerishable] = useState("all"); // qc

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, productId: null });

  const vendorId = vendor?.id;

  useEffect(() => {
    initCategories();
    if (vendorId) {
      fetchProducts({ fetchAll: true, limit: 200, includeUnpublished: true });
    }
  }, [vendorId, workspace, initCategories, fetchProducts]);

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
          String(product.categoryId?._id ?? product.categoryId ?? "") === selectedCategory
      );
    }

    // QC-specific: perishable filter
    if (activeFilters.includes("perishable") && filterPerishable !== "all") {
      filtered = filtered.filter((product) =>
        filterPerishable === "yes"
          ? product.quickCommerce?.isPerishable === true
          : product.quickCommerce?.isPerishable !== true
      );
    }

    // Wholesale-specific: MOQ filter
    if (activeFilters.includes("moq") && filterMoq !== "all") {
      filtered = filtered.filter((product) =>
        filterMoq === "enabled"
          ? product.wholesale?.moqEnabled === true
          : product.wholesale?.moqEnabled !== true
      );
    }

    return filtered;
  }, [products, searchQuery, selectedStatus, selectedCategory, filterPerishable, filterMoq, activeFilters]);

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
            {/* Quick Commerce is rider-delivered and never declared to a
                courier, so an unmeasured QC-only product is not a problem. */}
            {needsShippingData(row) && (
              <FiAlertTriangle
                className="w-3.5 h-3.5 shrink-0 text-amber-500"
                title="No shipping weight set — consignments for this product are estimated"
                aria-label="No shipping weight set"
              />
            )}
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
    {
      key: "publishing",
      label: "Workspace",
      sortable: false,
      render: (_, row) => {
        const flag = workspace === 'quick_commerce' ? 'quickCommerceEnabled' : `${workspace}Enabled`;
        return <StatusBadge status={row[flag] === true ? 'active' : 'pending'} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {(workspace === 'quick_commerce' ? row.quickCommerceEnabled : row[`${workspace}Enabled`]) === true && <button
            onClick={(e) => {
              e.stopPropagation();
              handleActionClick(`/vendor/products/${row._id ?? row.id}`);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <FiEdit />
          </button>}
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
          {workspace !== 'quick_commerce' && <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsBulkModalOpen(true)}
            leftIcon={<FiUploadCloud />}
          >
            Bulk Upload
          </Button>}
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
      {/* Capability-driven filter bar — only shows filters relevant to this vendor type */}
      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          {/* Stock Status — all types */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Status</label>
            <div className="w-40">
              <AnimatedSelect
                name="status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={[
                  { value: "all",          label: "All Status" },
                  { value: "in_stock",     label: "In Stock" },
                  { value: "low_stock",    label: "Low Stock" },
                  { value: "out_of_stock", label: "Out of Stock" },
                ]}
              />
            </div>
          </div>

          {/* Category — all types */}
          {activeFilters.includes("category") && categories.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Category</label>
              <div className="w-48">
                <AnimatedSelect
                  name="category-filter"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  options={[
                    { value: "all", label: "All Categories" },
                    ...categories.map((cat) => ({
                      value: String(cat._id ?? cat.id),
                      label: cat.name,
                    })),
                  ]}
                />
              </div>
            </div>
          )}

          {/* QC: Perishable filter */}
          {activeFilters.includes("perishable") && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Perishable</label>
              <div className="w-40">
                <AnimatedSelect
                  name="perishable-filter"
                  value={filterPerishable}
                  onChange={(e) => setFilterPerishable(e.target.value)}
                  options={[
                    { value: "all", label: "All Products" },
                    { value: "yes", label: "Perishable" },
                    { value: "no",  label: "Non-Perishable" },
                  ]}
                />
              </div>
            </div>
          )}

          {/* Wholesale: MOQ filter */}
          {activeFilters.includes("moq") && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">MOQ</label>
              <div className="w-44">
                <AnimatedSelect
                  name="moq-filter"
                  value={filterMoq}
                  onChange={(e) => setFilterMoq(e.target.value)}
                  options={[
                    { value: "all",      label: "All Products" },
                    { value: "enabled",  label: "MOQ Enabled" },
                    { value: "disabled", label: "No MOQ" },
                  ]}
                />
              </div>
            </div>
          )}
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
