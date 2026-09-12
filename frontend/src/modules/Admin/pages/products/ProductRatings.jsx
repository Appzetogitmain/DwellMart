import { useState, useEffect } from "react";
import { FiStar, FiSearch, FiEye, FiX, FiTrash2 } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatDateTime } from '../../utils/adminHelpers';
import {
  getAllReviews,
  updateReviewStatus,
  deleteReview,
} from "../../services/adminService";
import toast from "react-hot-toast";

const ProductRatings = () => {
  const [ratings, setRatings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRating, setSelectedRating] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    ratingId: null,
  });

  const loadRatings = async () => {
    setIsLoading(true);
    try {
      const params = {
        search: searchQuery || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        page: currentPage,
        limit: pageSize,
      };
      const response = await getAllReviews(params);
      const reviewRows = response.data?.reviews || [];
      const total = response.data?.pagination?.total ?? reviewRows.length;
      const pages = response.data?.pagination?.pages ?? 1;

      const normalizedRows = reviewRows.map((row) => ({
        ...row,
        date: row.createdAt || row.date,
      }));
      setRatings(normalizedRows);
      setTotalItems(total);
      setTotalPages(pages);
    } catch (error) {
      setRatings([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadRatings();
  }, [searchQuery, statusFilter, currentPage, pageSize]);

  const filteredRatings = ratings;

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateReviewStatus(id, newStatus);
      setRatings((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
      );
      if (selectedRating?.id === id) {
        setSelectedRating((prev) => (prev ? { ...prev, status: newStatus } : prev));
      }
      toast.success("Review status updated");
    } catch (error) {
      // handled by interceptor
    }
  };

  const handleDelete = () => {
    if (deleteModal.ratingId) {
      deleteReview(deleteModal.ratingId)
        .then(() => {
          setRatings((prev) => prev.filter((r) => r.id !== deleteModal.ratingId));
          toast.success("Rating deleted successfully");
          setDeleteModal({ isOpen: false, ratingId: null });
          if (selectedRating?.id === deleteModal.ratingId) {
            setSelectedRating(null);
          }
        })
        .catch(() => {
          setDeleteModal({ isOpen: false, ratingId: null });
        });
    }
  };

  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <FiStar
            key={star}
            className={`text-sm ${star <= rating ? "text-yellow-400 fill-current" : "text-gray-300"
              }`}
          />
        ))}
        <span className="ml-2 text-sm text-gray-600">({rating})</span>
      </div>
    );
  };

  const columns = [
    {
      key: "productName",
      label: "Product",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">ID: {row.productId}</p>
        </div>
      ),
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (value) => renderStars(value),
    },
    {
      key: "review",
      label: "Review",
      sortable: false,
      render: (value) => (
        <p className="max-w-xs truncate text-sm text-gray-600">{value}</p>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleString(),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value, row) => (
        <AnimatedSelect
          value={value}
          onChange={(e) => handleStatusChange(row.id, e.target.value)}
          options={[
            { value: "approved", label: "Approved" },
            { value: "pending", label: "Pending" },
          ]}
          className="min-w-[120px]"
        />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRating(row);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details">
            <FiEye />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteModal({ isOpen: true, ratingId: row.id });
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete Rating">
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Product Ratings
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Manage customer reviews and ratings
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product, customer, or review..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <AnimatedSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "all", label: "All Status" },
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
              ]}
              className="min-w-[140px]"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading ratings...</div>
        ) : (
          <DataTable
            data={filteredRatings}
            columns={columns}
            pagination={true}
            serverSidePagination={true}
            totalItems={totalItems}
            totalPages={totalPages}
            currentPage={currentPage}
            itemsPerPage={pageSize}
            onPageChange={(page) => setCurrentPage(page)}
            showSizeChanger={true}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          />
        )}
      </div>

      {/* Rating Detail Modal */}
      {selectedRating && (
        <div
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4"
          onClick={() => setSelectedRating(null)}>
          <div
            className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Rating Details
              </h3>
              <button
                onClick={() => setSelectedRating(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <FiX className="text-xl text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Product
                </label>
                <p className="text-base text-gray-800 mt-1">
                  {selectedRating.productName}
                </p>
                <p className="text-sm text-gray-500">
                  ID: {selectedRating.productId}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Customer
                </label>
                <p className="text-base text-gray-800 mt-1">
                  {selectedRating.customerName}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Rating
                </label>
                <div className="mt-1">{renderStars(selectedRating.rating)}</div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Review
                </label>
                <p className="text-base text-gray-800 mt-1 whitespace-pre-wrap">
                  {selectedRating.review}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Date
                </label>
                <p className="text-base text-gray-800 mt-1">
                  {formatDateTime(selectedRating.date)}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Status
                </label>
                <div className="mt-1">
                  <AnimatedSelect
                    value={selectedRating.status}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      handleStatusChange(selectedRating.id, newStatus);
                      setSelectedRating({
                        ...selectedRating,
                        status: newStatus,
                      });
                    }}
                    options={[
                      { value: "approved", label: "Approved" },
                      { value: "pending", label: "Pending" },
                    ]}
                    className="min-w-[120px]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={() => setSelectedRating(null)}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, ratingId: null })}
        onConfirm={handleDelete}
        title="Delete Rating"
        message="Are you sure you want to delete this rating? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default ProductRatings;
