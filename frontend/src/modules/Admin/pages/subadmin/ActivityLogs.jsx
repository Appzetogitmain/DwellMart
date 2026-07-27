import { useState, useEffect } from 'react';
import {
  FiClock,
  FiArrowLeft,
  FiRefreshCw,
  FiShield,
  FiUserCheck,
  FiKey,
  FiTrash2,
  FiEdit,
  FiUserPlus,
  FiSearch,
  FiChevronDown,
  FiChevronUp,
  FiGlobe,
  FiCheckCircle,
  FiXCircle,
  FiZap,
  FiCode,
  FiInfo,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSubAdminLogs } from '../../services/adminService';

const ActivityLogs = () => {
  const navigate = useNavigate();

  // State
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalLogs: 0,
    todayActions: 0,
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0,
  });
  const [pagination, setPagination] = useState({
    totalLogs: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [rawJsonLogIds, setRawJsonLogIds] = useState(new Set());

  const fetchLogs = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await getSubAdminLogs({
        page,
        limit: pagination.limit,
        search: searchQuery,
        action: selectedAction,
      });

      const responseData = res?.data || {};
      const logsList = Array.isArray(responseData.logs) ? responseData.logs : Array.isArray(responseData) ? responseData : [];

      setLogs(logsList);

      if (responseData.pagination) {
        setPagination(responseData.pagination);
      }
      if (responseData.stats) {
        setStats(responseData.stats);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to fetch activity logs.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [selectedAction, pagination.limit]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const toggleExpand = (logId) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const toggleRawJson = (logId) => {
    setRawJsonLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today • ${timeStr}`;
    }
    const dateStrFormatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${dateStrFormatted} • ${timeStr}`;
  };

  const formatIpAddress = (ip) => {
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
      return '127.0.0.1 (Development)';
    }
    return ip;
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'subadmin_created':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs">
            <FiUserPlus className="w-3.5 h-3.5 text-emerald-600" /> Created Sub Admin
          </span>
        );
      case 'subadmin_updated':
        return (
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs">
            <FiEdit className="w-3.5 h-3.5 text-blue-600" /> Updated Permissions
          </span>
        );
      case 'status_toggled':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs">
            <FiUserCheck className="w-3.5 h-3.5 text-amber-600" /> Status Changed
          </span>
        );
      case 'password_reset':
        return (
          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200/80 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs">
            <FiKey className="w-3.5 h-3.5 text-purple-600" /> Password Reset
          </span>
        );
      case 'subadmin_deleted':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs">
            <FiTrash2 className="w-3.5 h-3.5 text-rose-600" /> Deleted Account
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold capitalize">
            {action?.replace('_', ' ')}
          </span>
        );
    }
  };

  const getActionAccentStyle = (action) => {
    switch (action) {
      case 'subadmin_created':
        return 'bg-emerald-50/60 border-emerald-200 text-emerald-900';
      case 'subadmin_updated':
        return 'bg-blue-50/60 border-blue-200 text-blue-900';
      case 'status_toggled':
        return 'bg-amber-50/60 border-amber-200 text-amber-900';
      case 'password_reset':
        return 'bg-purple-50/60 border-purple-200 text-purple-900';
      case 'subadmin_deleted':
        return 'bg-rose-50/60 border-rose-200 text-rose-900';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => navigate('/admin/subadmins')}
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
            title="Back to Sub Admins"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2.5 bg-primary-50 text-primary-600 rounded-2xl border border-primary-100">
            <FiClock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Admin Activity Audit Dashboard
            </h1>
            <p className="text-xs text-gray-500">
              Real-time audit trail of sub-admin management actions and privilege updates
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchLogs(pagination.page)}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-2xs"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Activity</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-gray-500">Total Logs</span>
            <FiClock className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <p className="text-xl font-extrabold text-gray-900">{stats.totalLogs}</p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-blue-100 bg-blue-50/20 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-blue-700">Today's Actions</span>
            <FiZap className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <p className="text-xl font-extrabold text-blue-900">{stats.todayActions}</p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-emerald-100 bg-emerald-50/20 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-emerald-700">Created</span>
            <FiUserPlus className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-xl font-extrabold text-emerald-900">{stats.createdCount}</p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-purple-100 bg-purple-50/20 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-purple-700">Permission Changes</span>
            <FiEdit className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <p className="text-xl font-extrabold text-purple-900">{stats.updatedCount}</p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-rose-100 bg-rose-50/20 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-rose-700">Deleted Accounts</span>
            <FiTrash2 className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <p className="text-xl font-extrabold text-rose-900">{stats.deletedCount}</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by performer, target, or email..."
            className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">Action:</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:ring-2 focus:ring-primary-500 focus:outline-none">
              <option value="all">All Actions</option>
              <option value="subadmin_created">🟢 Created Sub Admin</option>
              <option value="subadmin_updated">🔵 Updated Permissions</option>
              <option value="status_toggled">🟡 Status Changed</option>
              <option value="password_reset">🟣 Password Reset</option>
              <option value="subadmin_deleted">🔴 Deleted Account</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">Per Page:</label>
            <select
              value={pagination.limit}
              onChange={(e) => setPagination((prev) => ({ ...prev, limit: Number(e.target.value) }))}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:ring-2 focus:ring-primary-500 focus:outline-none">
              <option value="10">10 Rows</option>
              <option value="25">25 Rows</option>
              <option value="50">50 Rows</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Timeline Table */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-xs">
            <FiRefreshCw className="w-7 h-7 animate-spin mx-auto mb-2 text-primary-500" />
            <p>Loading activity logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-xs">
            <FiShield className="w-9 h-9 mx-auto mb-2 text-gray-300" />
            <p className="font-semibold text-gray-700 text-sm">No activity logs found</p>
            <p className="text-gray-400 mt-1">Try adjusting your search or action filter options above.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => {
              const isExpanded = expandedLogIds.has(log._id);
              const showRawJson = rawJsonLogIds.has(log._id);
              const performer = log.performedBy || {};
              const target = log.targetAdmin || {};
              const details = log.details || {};

              return (
                <div key={log._id} className="transition-colors hover:bg-gray-50/50">
                  {/* Summary Bar - 12 Column Fixed Grid with Tight Padding */}
                  <div className="py-3 px-4 grid grid-cols-12 items-center gap-3">
                    {/* Action Badge */}
                    <div className="col-span-2 flex items-center shrink-0">
                      {getActionBadge(log.action)}
                    </div>

                    {/* Performer Info */}
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-100 border text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                        {performer.name?.charAt(0).toUpperCase() || 'S'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 text-xs truncate" title={performer.name || 'Super Admin'}>
                          {performer.name || 'Super Admin'}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate" title={performer.email || 'admin@admin.com'}>
                          {performer.email || 'admin@admin.com'}
                        </p>
                      </div>
                    </div>

                    {/* Arrow Indicator */}
                    <div className="col-span-1 flex items-center justify-center text-gray-300 font-bold text-xs shrink-0">
                      ➔
                    </div>

                    {/* Target Info */}
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary-50 text-primary-700 border border-primary-200 font-bold flex items-center justify-center text-xs shrink-0">
                        {target.name?.charAt(0).toUpperCase() || details.name?.charAt(0).toUpperCase() || 'T'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-semibold text-gray-800 text-xs truncate" title={target.name || details.name || 'Sub Admin'}>
                            {target.name || details.name || 'Sub Admin'}
                          </p>
                          <span className="px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded text-[9px] font-bold shrink-0">
                            {target.role || 'subadmin'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate" title={target.email || details.deletedEmail || details.targetEmail || details.email || '—'}>
                          {target.email || details.deletedEmail || details.targetEmail || details.email || '—'}
                        </p>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="col-span-2 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </div>

                    {/* Expand Details Trigger */}
                    <div className="col-span-1 text-right shrink-0">
                      <button
                        onClick={() => toggleExpand(log._id)}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap">
                        <span>{isExpanded ? 'Hide' : 'Details'}</span>
                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Light Detail Drawer with Color Accent Header */}
                  {isExpanded && (
                    <div className="px-6 py-5 bg-slate-50/80 border-t border-slate-200 text-xs space-y-4 animate-fadeIn">
                      {/* Color Accent Card Header */}
                      <div className={`p-3.5 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${getActionAccentStyle(log.action)}`}>
                        <div className="flex items-center gap-2">
                          <FiInfo className="w-4 h-4" />
                          <span className="font-bold text-xs uppercase tracking-wide">
                            {log.action?.replace('_', ' ')} Audit Summary
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-medium">
                          <span className="flex items-center gap-1">
                            <FiGlobe className="w-3.5 h-3.5 opacity-70" />
                            IP: {formatIpAddress(log.ipAddress)}
                          </span>
                          <span>•</span>
                          <span>Audit ID: <code className="font-mono bg-white/60 px-1.5 py-0.5 rounded text-[10px]">{log._id}</code></span>
                        </div>
                      </div>

                      {/* Human-Readable Structured Details (NO Raw JSON by Default) */}
                      {!showRawJson && (
                        <div className="space-y-4">
                          {/* 1. Permission Updates View */}
                          {log.action === 'subadmin_updated' && (
                            <div className="space-y-3">
                              {/* Added Permissions */}
                              {details.addedPermissions && details.addedPermissions.length > 0 && (
                                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                                  <p className="font-bold text-emerald-800 text-xs flex items-center gap-1.5">
                                    <FiCheckCircle className="text-emerald-600" />
                                    Permissions Added ({details.addedPermissions.length})
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {details.addedPermissions.map((p) => (
                                      <span key={p} className="px-2.5 py-1 bg-white text-emerald-700 border border-emerald-300 rounded-lg text-xs font-mono font-semibold shadow-2xs">
                                        ✓ {p}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Removed Permissions */}
                              {details.removedPermissions && details.removedPermissions.length > 0 && (
                                <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3.5 space-y-2">
                                  <p className="font-bold text-rose-800 text-xs flex items-center gap-1.5">
                                    <FiXCircle className="text-rose-600" />
                                    Permissions Removed ({details.removedPermissions.length})
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {details.removedPermissions.map((p) => (
                                      <span key={p} className="px-2.5 py-1 bg-white text-rose-700 border border-rose-300 rounded-lg text-xs font-mono font-semibold shadow-2xs">
                                        ✗ {p}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Active Permission Grants Chips */}
                              {details.permissions && details.permissions.length > 0 && (
                                <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2">
                                  <p className="font-bold text-gray-700 text-xs">
                                    Active Permission Grants ({details.permissions.length}):
                                  </p>
                                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                    {details.permissions.map((perm) => (
                                      <span key={perm} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[11px] font-mono border border-gray-200">
                                        {perm}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 2. Structured Information Cards for Non-Update Actions */}
                          {log.action !== 'subadmin_updated' && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="bg-white p-3 rounded-xl border border-gray-200">
                                <p className="text-[11px] text-gray-500 font-medium">Target Sub-Admin</p>
                                <p className="font-bold text-gray-900 text-xs mt-0.5">{details.name || target.name || 'Sub Admin'}</p>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-gray-200">
                                <p className="text-[11px] text-gray-500 font-medium">Email Address</p>
                                <p className="font-semibold text-gray-800 text-xs mt-0.5">{details.deletedEmail || details.targetEmail || details.email || target.email || '—'}</p>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-gray-200">
                                <p className="text-[11px] text-gray-500 font-medium">Action Performed By</p>
                                <p className="font-semibold text-gray-800 text-xs mt-0.5">{performer.name || 'Super Admin'} ({performer.email || 'admin@admin.com'})</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Optional Raw JSON Inspector */}
                      {showRawJson && (
                        <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 text-[11px] font-mono overflow-x-auto shadow-inner">
                          <p className="text-[10px] text-slate-400 mb-2 font-sans font-semibold">Raw JSON Payload:</p>
                          <pre className="whitespace-pre-wrap">{JSON.stringify(log, null, 2)}</pre>
                        </div>
                      )}

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] text-gray-500">
                        <span>Recorded at {new Date(log.createdAt).toLocaleString()}</span>
                        <button
                          onClick={() => toggleRawJson(log._id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-primary-600 transition-colors">
                          <FiCode className="w-3.5 h-3.5" />
                          <span>{showRawJson ? 'Hide Raw Data' : 'View Raw Data (JSON)'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-gray-500 font-medium">
            Page <span className="font-bold text-gray-800">{pagination.page}</span> of <span className="font-bold text-gray-800">{pagination.totalPages}</span> ({pagination.totalLogs} Total Audit Records)
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors">
              ← Previous
            </button>
            <span className="text-xs font-bold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-xl border border-primary-200">
              {pagination.page}
            </span>
            <button
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityLogs;
