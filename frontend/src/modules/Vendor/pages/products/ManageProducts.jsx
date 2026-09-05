import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiSearch, FiEdit, FiTrash2, FiAlertTriangle, FiDownload, FiUploadCloud, FiList, FiBox, FiTag } from "react-icons/fi";
import { motion } from "framer-motion";
import { DashboardPage, DataTable, StatusBadge } from "../../../../shared/components/Dashboard";
import { Button, Badge, Card, Input, SkeletonLoader, EmptyState } from "../../../../shared/components/ui";
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
  const PRODUCT_IMAGE_PLACEHOLDER = getPlaceholderImage(60, 60, "Product");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const handlePageChange = (page) => {
    setSearchParams((prev) => { prev.set("page", String(page)); return prev; }, { replace: true });
  };

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
  const currentExperience = workspace === 'quick_commerce' ? 'quick_commerce' : 'marketplace';

  useEffect(() => {
    initCategories(currentExperience);
    if (vendorId) {
      fetchProducts({ fetchAll: true, limit: 200, includeUnpublished: true });
    }
  }, [vendorId, currentExperience, initCategories, fetchProducts]);

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
      render: (value) => (
        <span className="font-mono text-xs text-slate-500 font-semibold">
          {String(value).slice(-6).toUpperCase()}
        </span>
      ),
    },
    {
      key: "name",
      label: "Product",
      sortable: true,
      render: (value, row) => {
        const imgSrc = getImageUrl(row.image || row.images?.[0], PRODUCT_IMAGE_PLACEHOLDER);
        return (
          <div className="flex items-center gap-3">
            <img
              src={imgSrc}
              alt={value}
              className="w-10 h-10 object-cover rounded-lg border border-slate-100 flex-shrink-0"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
              }}
            />
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="font-medium text-slate-900 truncate max-w-[220px]">{value}</span>
              {needsShippingData(row) && (
                <FiAlertTriangle
                  className="w-3.5 h-3.5 shrink-0 text-amber-500 cursor-help"
                  title="No shipping weight set — consignments for this product are estimated"
                  aria-label="No shipping weight set"
                />
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      render: (value) => <span className="font-bold text-slate-900">{formatPrice(value)}</span>,
    },
    {
      key: "stockQuantity",
      label: "Stock",
      sortable: true,
      render: (value) => (
        <span className="font-medium text-slate-700">
          {value?.toLocaleString() || 0}
        </span>
      ),
    },
    {
      key: "stock",
      label: "Stock Status",
      sortable: true,
      render: (value) => (
        <StatusBadge
          status={value === "in_stock" ? "in_stock" : value === "low_stock" ? "low_stock" : "out_of_stock"}
        />
      ),
    },
    {
      key: "publishing",
      label: "Publishing",
      sortable: false,
      render: (_, row) => {
        const flag = workspace === 'quick_commerce' ? 'quickCommerceEnabled' : `${workspace}Enabled`;
        return <StatusBadge status={row[flag] === true ? 'published' : 'unpublished'} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          {(workspace === 'quick_commerce' ? row.quickCommerceEnabled : row[`${workspace}Enabled`]) === true && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const searchStr = searchParams.toString();
                handleActionClick(`/vendor/products/${row._id ?? row.id}${searchStr ? `?${searchStr}` : ""}`);
              }}
              className="p-1.5 text-slate-600 hover:text-brand-primary hover:bg-slate-100 rounded-lg transition-colors"
              title="Edit Product"
            >
              <FiEdit className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteModal({ isOpen: true, productId: row._id ?? row.id });
            }}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Delete Product"
          >
            <FiTrash2 className="w-4 h-4" />
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
      {/* Filters Bar */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); handlePageChange(1); }}
              placeholder="Search products by name..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Stock Status */}
          <div className="w-36 sm:w-40">
            <AnimatedSelect
              name="status-filter"
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); handlePageChange(1); }}
              options={[
                { value: "all",          label: "All Stock" },
                { value: "in_stock",     label: "In Stock" },
                { value: "low_stock",    label: "Low Stock" },
                { value: "out_of_stock", label: "Out of Stock" },
              ]}
            />
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div className="w-40 sm:w-44">
              <AnimatedSelect
                name="category-filter"
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); handlePageChange(1); }}
                options={[
                  { value: "all", label: "All Categories" },
                  ...categories.map((cat) => ({
                    value: String(cat._id ?? cat.id),
                    label: cat.name,
                  })),
                ]}
              />
            </div>
          )}

          {/* QC: Perishable filter */}
          {activeFilters.includes("perishable") && (
            <div className="w-36">
              <AnimatedSelect
                name="perishable-filter"
                value={filterPerishable}
                onChange={(e) => { setFilterPerishable(e.target.value); handlePageChange(1); }}
                options={[
                  { value: "all", label: "All Products" },
                  { value: "yes", label: "Perishable" },
                  { value: "no",  label: "Non-Perishable" },
                ]}
              />
            </div>
          )}

          {/* Wholesale: MOQ filter */}
          {activeFilters.includes("moq") && (
            <div className="w-36">
              <AnimatedSelect
                name="moq-filter"
                value={filterMoq}
                onChange={(e) => { setFilterMoq(e.target.value); handlePageChange(1); }}
                options={[
                  { value: "all",      label: "All Products" },
                  { value: "enabled",  label: "MOQ Enabled" },
                  { value: "disabled", label: "No MOQ" },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP VIEW: Data Table (Hidden on Mobile) */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={filteredProducts}
          loading={isLoading}
          searchable={false}
          emptyTitle="No products found"
          emptyDescription="Get started by adding your first product to your catalog."
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
      </div>

      {/* MOBILE VIEW: Responsive Product Cards (Visible on Mobile) */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <SkeletonLoader.Table rows={4} />
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            variant="no-data"
            title="No products found"
            description="Get started by adding your first product to your catalog."
          />
        ) : (
          filteredProducts.map((product) => {
            const imgSrc = getImageUrl(product.image || product.images?.[0], PRODUCT_IMAGE_PLACEHOLDER);
            const flag = workspace === 'quick_commerce' ? 'quickCommerceEnabled' : `${workspace}Enabled`;
            const isPublished = product[flag] === true;
            const stockStatus = product.stock === "in_stock" ? "in_stock" : product.stock === "low_stock" ? "low_stock" : "out_of_stock";

            return (
              <Card key={product._id ?? product.id} variant="default" padding="sm" className="bg-white border-slate-200">
                <div className="flex gap-3">
                  <img
                    src={imgSrc}
                    alt={product.name}
                    className="w-16 h-16 object-cover rounded-xl border border-slate-100 flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {product.name}
                      </h4>
                      {needsShippingData(product) && (
                        <FiAlertTriangle
                          className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"
                          title="No shipping weight set"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-900">
                        {formatPrice(product.price)}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-semibold text-slate-600">
                        Stock: {product.stockQuantity ?? 0}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <StatusBadge status={stockStatus} size="xs" />
                      <StatusBadge status={isPublished ? "published" : "unpublished"} size="xs" />
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                        #{String(product._id ?? product.id).slice(-6).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mobile Card Action Buttons */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                  {isPublished && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const searchStr = searchParams.toString();
                        handleActionClick(`/vendor/products/${product._id ?? product.id}${searchStr ? `?${searchStr}` : ""}`);
                      }}
                      leftIcon={<FiEdit />}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="danger-outline"
                    size="xs"
                    onClick={() => setDeleteModal({ isOpen: true, productId: product._id ?? product.id })}
                    leftIcon={<FiTrash2 />}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

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
        workspace={workspace}
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
