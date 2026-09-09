import { useState, useMemo, useEffect } from "react";
import { FiStar, FiSearch, FiEye, FiMessageSquare, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ExportButton from "../../Admin/components/ExportButton";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import {
  getAllVendorReviews,
  updateVendorReviewStatus,
  addVendorReviewResponse,
} from "../services/vendorService";
import toast from "react-hot-toast";

const ProductReviews = () => {
  const { vendor } = useVendorAuthStore();
  const { products, fetchProducts } = useVendorProductStore();
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedReview, setSelectedReview] = useState(null);
  const [responseText, setResponseText] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) {
      setReviews([]);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        await fetchProducts({ fetchAll: true, limit: 200 });
        const res = await getAllVendorReviews({ limit: 100 });
        const payload = res?.data ?? res;
        setReviews(payload?.reviews ?? []);
      } catch {
        setReviews([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [vendorId, fetchProducts]);

  const vendorProducts = products || [];

  const filteredReviews = useMemo(() => {
    let filtered = reviews;

    if (searchQuery) {
      filtered = filtered.filter(
        (review) =>
          review.productName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          review.customerName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          review.comment?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedRating !== "all") {
      filtered = filtered.filter(
        (review) => review.rating === parseInt(selectedRating)
      );
    }

    if (selectedProduct !== "all") {
      filtered = filtered.filter(
        (review) => String(review.productId) === String(selectedProduct)
      );
    }

    return filtered;
  }, [reviews, searchQuery, selectedRating, selectedProduct]);

  const handleResponse = async (reviewId) => {
    const text = responseText.trim();
    if (!text) return;
    try {
      const res = await addVendorReviewResponse(reviewId, text);
      const updated = res?.data ?? res;
      setReviews((prev) =>
        prev.map((review) => (review.id === reviewId ? updated : review))
      );
      setSelectedReview((prev) =>
        prev && prev.id === reviewId ? updated : prev
      );
    } catch {
      return;
    }
    setSelectedReview(null);
    setResponseText("");
    toast.success("Response added successfully");
  };

  const handleModerate = async (reviewId, action) => {
    const nextStatus = action === "hide" ? "hidden" : "approved";
    try {
      const res = await updateVendorReviewStatus(reviewId, nextStatus);
      const updated = res?.data ?? res;
      setReviews((prev) =>
        prev.map((review) => (review.id === reviewId ? updated : review))
      );
      setSelectedReview((prev) =>
        prev && prev.id === reviewId ? updated : prev
      );
    } catch {
      return;
    }
    toast.success(action === "hide" ? "Review hidden" : "Review approved");
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
          <p className="font-medium text-gray-800">
            {value || "Unknown Product"}
          </p>
          <p className="text-xs text-gray-500">ID: {row.productId}</p>
        </div>
      ),
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          {row.customerEmail && (
            <p className="text-xs text-gray-500">{row.customerEmail}</p>
          )}
        </div>
      ),
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (value) => renderStars(value),
    },
    {
      key: "comment",
      label: "Review",
      sortable: false,
      render: (value) => (
        <p className="max-w-xs truncate text-sm text-gray-600">
          {value || "No comment"}
        </p>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "approved"
              ? "success"
              : value === "hidden"
                ? "warning"
                : "pending"
          }>
          {value || "pending"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value || new Date()).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedReview(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View & Respond">
            <FiEye />
          </button>
          {row.status !== "hidden" && (
            <button
              onClick={() => handleModerate(row.id, "hide")}
              className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
              title="Hide Review">
              <FiX />
            </button>
          )}
          {row.status !== "approved" && (
            <button
              onClick={() => handleModerate(row.id, "approve")}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Approve Review">
              <FiStar />
            </button>
          )}
        </div>
      ),
    },
  ];

  const ratingStats = useMemo(() => {
    const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((review) => {
      if (review.rating) stats[review.rating] = (stats[review.rating] || 0) + 1;
    });
    return stats;
  }, [reviews]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view reviews</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Product Reviews
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Manage customer reviews and ratings
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {[5, 4, 3, 2, 1].map((rating) => (
          <div
            key={rating}
            className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs sm:text-sm text-gray-600">
                {rating} Star
              </span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-gray-800">
              {ratingStats[rating] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reviews..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>

          <AnimatedSelect
            value={selectedRating}
            onChange={(e) => setSelectedRating(e.target.value)}
            options={[
              { value: "all", label: "All Ratings" },
              { value: "5", label: "5 Stars" },
              { value: "4", label: "4 Stars" },
              { value: "3", label: "3 Stars" },
              { value: "2", label: "2 Stars" },
              { value: "1", label: "1 Star" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <AnimatedSelect
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            options={[
              { value: "all", label: "All Products" },
              ...vendorProducts.map((p) => ({
                value: String(p._id ?? p.id),
                label: p.name,
              })),
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <div className="w-full sm:w-auto">
            <ExportButton
              data={filteredReviews}
              headers={[
                { label: "Product", accessor: (row) => row.productName },
                { label: "Customer", accessor: (row) => row.customerName },
                { label: "Rating", accessor: (row) => row.rating },
                { label: "Review", accessor: (row) => row.comment },
                { label: "Status", accessor: (row) => row.status },
                {
                  label: "Date",
                  accessor: (row) =>
                    new Date(row.createdAt).toLocaleDateString(),
                },
              ]}
              filename="vendor-reviews"
            />
          </div>
        </div>
      </div>

      {/* Reviews Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">Loading reviews...</p>
        </div>
      ) : filteredReviews.length > 0 ? (
        <DataTable
          data={filteredReviews}
          columns={columns}
          pagination={true}
          itemsPerPage={itemsPerPage}
          showSizeChanger={true}
          pageSizeOptions={[25, 50, 100, 250, 500, 'All']}
          onPageSizeChange={setItemsPerPage}
        />
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">No reviews found</p>
        </div>
      )}

      {/* Review Detail Modal */}
      {selectedReview && (
        <div
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4"
          onClick={() => {
            setSelectedReview(null);
            setResponseText("");
          }}>
          <div
            className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Review Details
              </h3>
              <button
                onClick={() => {
                  setSelectedReview(null);
                  setResponseText("");
                }}
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
                  {selectedReview.productName}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Customer
                </label>
                <p className="text-base text-gray-800 mt-1">
                  {selectedReview.customerName}
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Rating
                </label>
                <div className="mt-1">{renderStars(selectedReview.rating)}</div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">
                  Review
                </label>
                <p className="text-base text-gray-800 mt-1 whitespace-pre-wrap">
                  {selectedReview.comment || "No comment provided"}
                </p>
              </div>

              {selectedReview.vendorResponse && (
                <div>
                  <label className="text-sm font-semibold text-gray-600">
                    Your Response
                  </label>
                  <p className="text-base text-gray-800 mt-1 bg-gray-50 p-3 rounded-lg">
                    {selectedReview.vendorResponse}
                  </p>
                </div>
              )}

              {!selectedReview.vendorResponse && (
                <div>
                  <label className="text-sm font-semibold text-gray-600 mb-2 block">
                    Respond to Review
                  </label>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Write your response..."
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows="4"
                  />
                  <button
                    onClick={() => handleResponse(selectedReview.id)}
                    disabled={!responseText.trim()}
                    className="mt-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                    <FiMessageSquare className="inline mr-2" />
                    Submit Response
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                {selectedReview.status !== "approved" && (
                  <button
                    onClick={() => handleModerate(selectedReview.id, "approve")}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm">
                    Approve Review
                  </button>
                )}
                {selectedReview.status !== "hidden" && (
                  <button
                    onClick={() => handleModerate(selectedReview.id, "hide")}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors font-semibold text-sm">
                    Hide Review
                  </button>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200 gap-2">
                <button
                  onClick={() => {
                    setSelectedReview(null);
                    setResponseText("");
                  }}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ProductReviews;
