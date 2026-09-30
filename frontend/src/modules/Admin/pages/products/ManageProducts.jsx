import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { FiSearch, FiEdit, FiTrash2, FiPlus, FiDownload, FiList, FiUploadCloud, FiX, FiFolder, FiRefreshCw } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";
import ProductFormModal from "../../components/ProductFormModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import CategorySelector from "../../components/CategorySelector";
import PermissionGuard from "../../../../shared/components/PermissionGuard";
import BulkUploadModal from "../../../../shared/components/BulkUploadModal";
import ImportHistoryModal from "../../../../shared/components/ImportHistoryModal";
import { ProductWholesaleBadge } from "../../../../shared/components/WholesaleBadge";
import { formatPrice, getPlaceholderImage } from "../../../../shared/utils/helpers";

import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useBrandStore } from "../../../../shared/store/brandStore";
import { getAllProducts, getAllVendors, deleteProduct, exportProductsCatalog, getProductsMissingShipping, updateProduct, updateProductPublicationStatus, bulkUpdateProductPublicationStatus } from "../../services/adminService";
import toast from "react-hot-toast";

const ManageProducts = () => {
  const PRODUCT_IMAGE_PLACEHOLDER = getPlaceholderImage(50, 50, "Product");
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  /**
   * How much of the courier-eligible catalogue is booking at an estimate.
   * Surfaced here because this is where an operator can actually do something
   * about it.
   */
  const [missingShipping, setMissingShipping] = useState(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProductsMissingShipping({ limit: 1 })
      .then((res) => { if (!cancelled) setMissingShipping(res?.data || null); })
      .catch(() => { if (!cancelled) setMissingShipping(null); });
    return () => { cancelled = true; };
  }, []);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const { categories, initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();

  const urlPage = parseInt(searchParams.get("page") || "1", 10);
  const currentPage = isNaN(urlPage) || urlPage < 1 ? 1 : urlPage;
  const pageSizeParam = searchParams.get("pageSize") || "50";
  const pageSize = String(pageSizeParam).toLowerCase() === "all" ? "All" : (parseInt(pageSizeParam, 10) || 50);

  const selectedStatus = searchParams.get("status") || "all";
  const selectedCategory = searchParams.get("categoryId") || searchParams.get("category") || "all";
  const selectedBrand = searchParams.get("brandId") || searchParams.get("brand") || "all";
  const selectedVendor = searchParams.get("vendorId") || "all";
  const selectedPublicationStatus = searchParams.get("publicationStatus") || "all";
  const queryParam = searchParams.get("search") || "";

  const [searchQuery, setSearchQuery] = useState(queryParam);
  useEffect(() => {
    setSearchQuery(queryParam);
  }, [queryParam]);

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    productId: null,
  });
  const [productFormModal, setProductFormModal] = useState({
    isOpen: false,
    productId: null,
  });
  const [quickEditModal, setQuickEditModal] = useState({
    isOpen: false,
    product: null,
    type: null, // 'name' | 'category'
  });
  const [quickEditName, setQuickEditName] = useState("");
  const [quickEditCategory, setQuickEditCategory] = useState({
    categoryId: "",
    subcategoryId: "",
  });
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [publicationModal, setPublicationModal] = useState({ isOpen: false, status: null, product: null, ids: [] });
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    getAllVendors({ limit: 1000 })
      .then((response) => setVendors(response?.data?.vendors || response?.data || []))
      .catch(() => setVendors([]));
  }, []);

  const handleOpenQuickEdit = (product, type) => {
    setQuickEditModal({ isOpen: true, product, type });
    if (type === "name") {
      setQuickEditName(product.name || "");
    } else {
      const catId = product.categoryId?._id || product.categoryId || "";
      setQuickEditCategory({
        categoryId: catId,
        subcategoryId: "",
      });
    }
  };

  const handleSaveQuickEdit = async () => {
    if (!quickEditModal.product) return;
    try {
      setIsQuickSaving(true);
      if (quickEditModal.type === "name") {
        const trimmed = quickEditName.trim();
        if (!trimmed || trimmed.length < 2) {
          toast.error("Product name must be at least 2 characters");
          setIsQuickSaving(false);
          return;
        }
        await updateProduct(quickEditModal.product.id, { name: trimmed });
        toast.success("Product renamed successfully");
      } else if (quickEditModal.type === "category") {
        const finalCat = quickEditCategory.subcategoryId || quickEditCategory.categoryId;
        if (!finalCat) {
          toast.error("Please select a category");
          setIsQuickSaving(false);
          return;
        }
        await updateProduct(quickEditModal.product.id, { categoryId: finalCat });
        toast.success("Category updated successfully");
      }
      setQuickEditModal({ isOpen: false, product: null, type: null });
      loadProducts();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to update product");
    } finally {
      setIsQuickSaving(false);
    }
  };

  const updateFilters = useCallback((updates, resetPage = false) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === undefined || val === null || val === "" || val === "all") {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      if (resetPage) {
        next.delete("page");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    initCategories();
    initBrands();
  }, []);

  // Debounce search query update to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim() !== queryParam) {
        updateFilters({ search: searchQuery.trim() }, true);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, queryParam, updateFilters]);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (queryParam.trim()) params.search = queryParam.trim();
      if (selectedStatus !== "all") params.status = selectedStatus;
      if (selectedCategory !== "all") params.categoryId = selectedCategory;
      if (selectedBrand !== "all") params.brandId = selectedBrand;
      if (selectedVendor !== "all") params.vendorId = selectedVendor;
      if (selectedPublicationStatus !== "all") params.publicationStatus = selectedPublicationStatus;

      const response = await getAllProducts(params);
      const pageProducts = Array.isArray(response.data)
        ? response.data
        : (response.data?.products || []);
      const total = Number(response.data?.total ?? pageProducts.length);
      const pages = Number(response.data?.pages ?? 1);

      const normalizedProducts = pageProducts.map(p => ({
        ...p,
        id: p._id, // Map backend _id to frontend id
        image: p.image || p.images?.[0] || PRODUCT_IMAGE_PLACEHOLDER,
        stock: p.stock || (p.stockQuantity > 5 ? "in_stock" : p.stockQuantity > 0 ? "low_stock" : "out_of_stock"),
      }));
      setProducts(normalizedProducts);
      setTotalItems(total);
      setTotalPages(pages);
    } catch (error) {
      // Error is handled in interceptor
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [currentPage, pageSize, queryParam, selectedStatus, selectedCategory, selectedBrand, selectedVendor, selectedPublicationStatus]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, pageSize, queryParam, selectedStatus, selectedCategory, selectedBrand, selectedVendor, selectedPublicationStatus]);

  const allPageSelected = products.length > 0 && products.every((product) => selectedIds.has(product.id));
  const somePageSelected = products.some((product) => selectedIds.has(product.id));
  const toggleSelectAll = () => {
    setSelectedIds(allPageSelected ? new Set() : new Set(products.map((product) => product.id)));
  };
  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openPublicationModal = (status, product = null) => {
    const ids = product ? [product.id] : Array.from(selectedIds);
    if (!ids.length) return;
    setPublicationModal({ isOpen: true, status, product, ids });
  };

  const confirmPublicationChange = async () => {
    const { status, product, ids } = publicationModal;
    try {
      setIsPublishing(true);
      if (product) {
        await updateProductPublicationStatus(product.id, status);
        toast.success(status === "LIVE" ? "Product is now live." : "Product is now offline.");
      } else {
        const response = await bulkUpdateProductPublicationStatus(ids, status);
        const result = response?.data || {};
        const updated = Number(result.updatedCount || 0);
        const failed = Number(result.failedCount || 0);
        if (failed) {
          toast.error(`${updated} product${updated === 1 ? " was" : "s were"} updated. ${failed} could not be updated.`);
        } else {
          toast.success(`${updated} product${updated === 1 ? " is" : "s are"} now ${status === "LIVE" ? "live" : "offline"}.`);
        }
        setSelectedIds(new Set());
      }
      setPublicationModal({ isOpen: false, status: null, product: null, ids: [] });
      await loadProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to update publication status");
    } finally {
      setIsPublishing(false);
    }
  };

  const columns = [
    {
      key: "selection",
      label: (
        <input
          type="checkbox"
          aria-label="Select all products on this page"
          checked={allPageSelected}
          ref={(node) => { if (node) node.indeterminate = somePageSelected && !allPageSelected; }}
          onChange={toggleSelectAll}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
      ),
      sortable: false,
      render: (_, row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.name}`}
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelected(row.id)}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
      ),
    },
    {
      key: "vendorId",
      label: "Vendor",
      sortable: false,
      render: (value) => value?.storeName || "Unknown vendor",
    },
    {
      key: "id",
      label: "ID",
      sortable: true,
    },
    {
      key: "name",
      label: "Product Name",
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{value}</span>
            <ProductWholesaleBadge product={row} />
            <PermissionGuard permission="products.edit">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenQuickEdit(row, "name");
                }}
                className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                title="Rename Product"
              >
                <FiEdit className="w-3.5 h-3.5" />
              </button>
            </PermissionGuard>
          </div>
        </div>
      ),
    },
    {
      key: "categoryId",
      label: "Category",
      sortable: false,
      render: (value, row) => {
        const catName = row.categoryId?.name || (typeof value === "object" ? value?.name : null);
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
              <FiFolder className="w-3 h-3 text-gray-400" />
              {catName || "Uncategorized"}
            </span>
            <PermissionGuard permission="products.edit">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenQuickEdit(row, "category");
                }}
                className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                title="Change Category"
              >
                <FiEdit className="w-3.5 h-3.5" />
              </button>
            </PermissionGuard>
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
      render: (value) => Number(value || 0).toLocaleString(),
    },
    {
      key: "stock",
      label: "Stock Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "in_stock"
              ? "success"
              : value === "low_stock"
                ? "warning"
                : "error"
          }>
          {value.replace("_", " ").toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "publicationStatus",
      label: "Publication",
      sortable: true,
      render: (value = "PENDING_REVIEW") => {
        const variants = { LIVE: "success", PENDING_REVIEW: "warning", OFFLINE: "info", REJECTED: "error" };
        return <Badge variant={variants[value] || "info"}>{String(value).replaceAll("_", " ")}</Badge>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <PermissionGuard permission="products.edit">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openPublicationModal(row.publicationStatus === "LIVE" ? "OFFLINE" : "LIVE", row);
              }}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${row.publicationStatus === "LIVE" ? "text-amber-700 bg-amber-50 hover:bg-amber-100" : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}
            >
              {row.publicationStatus === "LIVE" ? "Make Offline" : "Make Live"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProductFormModal({ isOpen: true, productId: row.id });
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <FiEdit />
            </button>
          </PermissionGuard>
          <PermissionGuard permission="products.delete">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteModal({ isOpen: true, productId: row.id });
              }}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <FiTrash2 />
            </button>
          </PermissionGuard>
        </div>
      ),
    },
  ];

  const confirmDelete = async () => {
    try {
      await deleteProduct(deleteModal.productId);
      setProducts(products.filter((p) => p.id !== deleteModal.productId));
      setDeleteModal({ isOpen: false, productId: null });
      toast.success("Product deleted successfully");
    } catch (error) {
      setDeleteModal({ isOpen: false, productId: null });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      {missingShipping?.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            <strong>{missingShipping.total}</strong> of {missingShipping.totalCourierEligible} courier
            products have no measured shipping weight — their consignments are declared at an
            estimate, which can attract weight discrepancy charges.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-sm font-semibold text-amber-900 underline underline-offset-2"
          >
            Filter by the warning icon below
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Manage Products
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View, edit, and manage your product catalog
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportProductsCatalog('xlsx')}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
            <FiDownload />
            Export Catalog
          </button>
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
            <FiList />
            Import History
          </button>
          <PermissionGuard permission="products.add">
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold">
              <FiUploadCloud />
              Bulk Upload
            </button>
          </PermissionGuard>
          <PermissionGuard permission="products.add">
            <button
              onClick={() => setProductFormModal({ isOpen: true, productId: "new" })}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold">
              <FiPlus />
              Add Product
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Filters Section */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (searchQuery.trim() !== queryParam) {
                      updateFilters({ search: searchQuery.trim() }, true);
                    }
                  }
                }}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              />
            </div>

            <AnimatedSelect
              value={selectedPublicationStatus}
              onChange={(e) => updateFilters({ publicationStatus: e.target.value }, true)}
              options={[
                { value: "all", label: "All Publication" },
                { value: "PENDING_REVIEW", label: "Pending Review" },
                { value: "LIVE", label: "Live" },
                { value: "OFFLINE", label: "Offline" },
                { value: "REJECTED", label: "Rejected" },
              ]}
              direction="down"
              className="w-full sm:w-auto min-w-[160px]"
            />

            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => updateFilters({ status: e.target.value }, true)}
              options={[
                { value: "all", label: "All Status" },
                { value: "in_stock", label: "In Stock" },
                { value: "low_stock", label: "Low Stock" },
                { value: "out_of_stock", label: "Out of Stock" },
              ]}
              direction="down"
              className="w-full sm:w-auto min-w-[140px]"
            />

            <AnimatedSelect
              value={selectedVendor}
              onChange={(e) => updateFilters({ vendorId: e.target.value }, true)}
              options={[
                { value: "all", label: "All Vendors" },
                ...vendors.map((vendor) => ({ value: String(vendor._id || vendor.id), label: vendor.storeName || vendor.name || vendor.email })),
              ]}
              searchable={true}
              searchPlaceholder="Search vendors..."
              direction="down"
              className="w-full sm:w-auto min-w-[170px]"
            />

            <AnimatedSelect
              value={selectedCategory}
              onChange={(e) => updateFilters({ categoryId: e.target.value }, true)}
              options={[
                { value: "all", label: "All Categories" },
                ...categories
                  .filter((cat) => cat.isActive !== false)
                  .map((cat) => ({ value: String(cat.id), label: cat.name })),
              ]}
              searchable={true}
              searchPlaceholder="Search categories..."
              direction="down"
              className="w-full sm:w-auto min-w-[170px]"
            />

            <AnimatedSelect
              value={selectedBrand}
              onChange={(e) => updateFilters({ brandId: e.target.value }, true)}
              options={[
                { value: "all", label: "All Brands" },
                ...brands
                  .filter((brand) => brand.isActive !== false)
                  .map((brand) => ({ value: String(brand.id), label: brand.name })),
              ]}
              searchable={true}
              searchPlaceholder="Search brands..."
              direction="down"
              className="w-full sm:w-auto min-w-[170px]"
            />

            {(queryParam || selectedStatus !== "all" || selectedPublicationStatus !== "all" || selectedVendor !== "all" || selectedCategory !== "all" || selectedBrand !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchParams({}, { replace: true });
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
                title="Clear all filters and reset pagination">
                <FiRefreshCw className="text-xs" />
                <span>Clear Filters</span>
              </button>
            )}

            <div className="w-full sm:w-auto">
              <ExportButton
                data={products}
                headers={[
                  { label: "ID", accessor: (row) => row.id },
                  { label: "Name", accessor: (row) => row.name },
                  { label: "Category", accessor: (row) => row.categoryId?.name || (typeof row.categoryId === 'string' ? row.categoryId : 'Uncategorized') },
                  { label: "Brand", accessor: (row) => row.brandId?.name || (typeof row.brandId === 'string' ? row.brandId : 'N/A') },
                  {
                    label: "Price",
                    accessor: (row) => formatPrice(row.price),
                  },
                  { label: "Stock", accessor: (row) => row.stockQuantity },
                  { label: "Status", accessor: (row) => row.stock },
                ]}
                filename="products"
              />
            </div>
          </div>
        </div>

        {/* DataTable */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
            <span className="text-sm font-semibold text-primary-900">{selectedIds.size} product{selectedIds.size === 1 ? "" : "s"} selected</span>
            <PermissionGuard permission="products.edit">
              <button type="button" onClick={() => openPublicationModal("LIVE")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Make Live</button>
              <button type="button" onClick={() => openPublicationModal("OFFLINE")} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700">Make Offline</button>
            </PermissionGuard>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Clear Selection</button>
          </div>
        )}
        <DataTable
          data={products}
          columns={columns}
          pagination={true}
          serverSidePagination={true}
          itemsPerPage={pageSize}
          currentPage={currentPage}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={(page) => updateFilters({ page }, false)}
          showSizeChanger={true}
          onPageSizeChange={(newSize) => updateFilters({ pageSize: newSize }, true)}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          onRowClick={(row) =>
            setProductFormModal({ isOpen: true, productId: row.id })
          }
        />
      </div>

      <ConfirmModal
        isOpen={publicationModal.isOpen}
        onClose={() => !isPublishing && setPublicationModal({ isOpen: false, status: null, product: null, ids: [] })}
        onConfirm={confirmPublicationChange}
        title={publicationModal.status === "LIVE" ? `Make ${publicationModal.ids.length > 1 ? `${publicationModal.ids.length} Products` : "Product"} Live?` : `Take ${publicationModal.ids.length > 1 ? `${publicationModal.ids.length} Products` : "Product"} Offline?`}
        message={publicationModal.status === "LIVE"
          ? `${publicationModal.product ? `${publicationModal.product.name}. ` : ""}Once live, ${publicationModal.ids.length > 1 ? "these products" : "this product"} will become visible to customers wherever eligible.`
          : `${publicationModal.product ? `${publicationModal.product.name}. ` : ""}${publicationModal.ids.length > 1 ? "These products" : "This product"} will no longer be available in customer-facing product listings.`}
        confirmText={publicationModal.status === "LIVE" ? "Make Live" : "Take Offline"}
        type={publicationModal.status === "LIVE" ? "success" : "danger"}
        isLoading={isPublishing}
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

      <ProductFormModal
        isOpen={productFormModal.isOpen}
        onClose={() => setProductFormModal({ isOpen: false, productId: null })}
        productId={productFormModal.productId}
        onSuccess={() => {
          loadProducts();
        }}
      />

      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        mode="admin"
        onSuccess={() => loadProducts()}
      />

      <ImportHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        mode="admin"
      />

      {/* Quick Edit Modal */}
      {quickEditModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => !isQuickSaving && setQuickEditModal({ isOpen: false, product: null, type: null })}
        >
          <div 
            className={`bg-white rounded-2xl shadow-2xl w-full p-4 sm:p-6 space-y-4 my-auto transition-all ${
              quickEditModal.type === "category" ? "max-w-3xl lg:max-w-4xl" : "max-w-lg"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">
                {quickEditModal.type === "name" ? "Rename Product" : "Edit Product Category"}
              </h3>
              <button
                type="button"
                disabled={isQuickSaving}
                onClick={() => setQuickEditModal({ isOpen: false, product: null, type: null })}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
              Target Product: <span className="font-semibold text-gray-800">{quickEditModal.product?.name}</span>
            </div>

            {quickEditModal.type === "name" ? (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={quickEditName}
                  onChange={(e) => setQuickEditName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  placeholder="Enter new product name"
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  Select Category <span className="text-red-500">*</span>
                </label>
                <CategorySelector
                  value={quickEditCategory.categoryId}
                  subcategoryId={quickEditCategory.subcategoryId}
                  onChange={(e) => {
                    const { name, value } = e.target;
                    setQuickEditCategory((prev) => ({ ...prev, [name]: value }));
                  }}
                  required
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                disabled={isQuickSaving}
                onClick={() => setQuickEditModal({ isOpen: false, product: null, type: null })}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isQuickSaving}
                onClick={handleSaveQuickEdit}
                className="px-5 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors font-semibold shadow-sm disabled:opacity-50"
              >
                {isQuickSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ManageProducts;
