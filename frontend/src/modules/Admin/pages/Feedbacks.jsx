import React, { useState, useEffect } from 'react';
import { FiMessageSquare, FiStar, FiFilter } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';

const Feedbacks = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [filters, setFilters] = useState({
    category: 'all',
    sort: 'newest',
  });

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        category: filters.category,
        sort: filters.sort,
      });

      const response = await api.get(`/admin/feedbacks?${queryParams.toString()}`);
      if (response?.success) {
        setFeedbacks(response.data?.feedbacks || []);
        if (response.data?.pagination) {
          setPagination(response.data.pagination);
        }
      }
    } catch (error) {
      toast.error('Failed to load feedbacks');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, filters]);

  const renderStars = (rating) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <FiStar
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? 'text-yellow-400 fill-current' : 'text-slate-600'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-700/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-500/20 text-primary-400 rounded-2xl">
                  <FiMessageSquare className="w-6 h-6" />
              </div>
              <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white">
                      User Feedbacks
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-400">
                      View customer ratings, suggestions, and feedback
                  </p>
              </div>
          </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700/50 shadow-xl overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-700/50 flex flex-col sm:flex-row gap-4 justify-between bg-slate-800/80">
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FiFilter className="text-slate-400" />
              <select
                value={filters.category}
                onChange={(e) => {
                  setPagination({ ...pagination, page: 1 });
                  setFilters({ ...filters, category: e.target.value });
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Categories</option>
                <option value="General">General</option>
                <option value="UI/UX">UI/UX</option>
                <option value="Bug">Bug</option>
                <option value="Suggestion">Suggestion</option>
              </select>
            </div>

            <select
              value={filters.sort}
              onChange={(e) => {
                setPagination({ ...pagination, page: 1 });
                setFilters({ ...filters, sort: e.target.value });
              }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest_rating">Highest Rating</option>
              <option value="lowest_rating">Lowest Rating</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700/50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="px-5 py-3.5 w-1/4">User</th>
                <th className="px-5 py-3.5 w-32">Category</th>
                <th className="px-5 py-3.5 w-32">Rating</th>
                <th className="px-5 py-3.5">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-5 py-8">
                    <div className="space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-10 bg-slate-700/50 rounded-lg animate-pulse w-full"></div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : feedbacks.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-5 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <FiMessageSquare className="w-12 h-12 text-slate-600 mb-3" />
                      <p className="text-lg font-medium">No feedback found</p>
                      <p className="text-sm">Try adjusting your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                feedbacks.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-200 text-sm">{item.name}</span>
                        <span className="text-xs text-slate-400">{item.email}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {renderStars(item.rating)}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-slate-300 leading-relaxed break-words" title={item.message}>
                        {item.message}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && pagination.pages > 1 && (
          <div className="p-4 border-t border-slate-700/50 flex justify-between items-center bg-slate-800/80">
            <span className="text-sm text-slate-400">
              Showing page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page === 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                className="px-3 py-1 bg-slate-700 text-slate-200 rounded disabled:opacity-50 hover:bg-slate-600 transition-colors text-sm"
              >
                Previous
              </button>
              <button
                disabled={pagination.page === pagination.pages}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                className="px-3 py-1 bg-slate-700 text-slate-200 rounded disabled:opacity-50 hover:bg-slate-600 transition-colors text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Feedbacks;
