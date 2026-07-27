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
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSubAdminLogs } from '../../services/adminService';

const ActivityLogs = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await getSubAdminLogs({ limit: 50 });
      const data = res?.data || [];
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch activity logs.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadge = (action) => {
    switch (action) {
      case 'subadmin_created':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-max">
            <FiUserPlus className="w-3.5 h-3.5" /> Created Sub Admin
          </span>
        );
      case 'subadmin_updated':
        return (
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-max">
            <FiEdit className="w-3.5 h-3.5" /> Updated Permissions
          </span>
        );
      case 'status_toggled':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-max">
            <FiUserCheck className="w-3.5 h-3.5" /> Status Toggled
          </span>
        );
      case 'password_reset':
        return (
          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-max">
            <FiKey className="w-3.5 h-3.5" /> Password Reset
          </span>
        );
      case 'subadmin_deleted':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-max">
            <FiTrash2 className="w-3.5 h-3.5" /> Deleted Sub Admin
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold w-max capitalize">
            {action?.replace('_', ' ')}
          </span>
        );
    }
  };

  const formatDetails = (details = {}) => {
    if (!details || Object.keys(details).length === 0) return '—';
    const parts = [];
    if (details.name) parts.push(`Name: ${details.name}`);
    if (details.newStatus) parts.push(`Status: ${details.newStatus.toUpperCase()}`);
    if (details.status) parts.push(`Status: ${details.status.toUpperCase()}`);
    if (details.permissionsCount !== undefined) parts.push(`Permissions: ${details.permissionsCount}`);
    if (details.targetEmail) parts.push(`Target: ${details.targetEmail}`);
    if (details.deletedEmail) parts.push(`Deleted: ${details.deletedEmail}`);
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(details);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/subadmins')}
            className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
            <FiClock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Admin Activity Audit Logs
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Audit trail of all administrative actions, sub-admin creations, permission updates, and status toggles
            </p>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2"
        >
          <FiRefreshCw className="w-4 h-4" />
          <span>Refresh Audit Logs</span>
        </button>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Performed By</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Target Account</th>
                <th className="py-3.5 px-4">Details</th>
                <th className="py-3.5 px-4">IP Address</th>
                <th className="py-3.5 px-4 text-right">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-400 text-xs">
                    Loading audit activity logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500 text-xs">
                    No activity logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const performer = log.performedBy || {};
                  const target = log.targetAdmin || {};

                  return (
                    <tr key={log._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs">
                            {performer.name?.charAt(0).toUpperCase() || 'A'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-xs">{performer.name || 'Super Admin'}</p>
                            <p className="text-[11px] text-gray-400">{performer.email || '—'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">{getActionBadge(log.action)}</td>

                      <td className="py-3.5 px-4 text-xs">
                        {target.name ? (
                          <div>
                            <p className="font-semibold text-gray-800">{target.name}</p>
                            <p className="text-[11px] text-gray-400">{target.email}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">
                            {log.details?.deletedEmail || log.details?.targetEmail || '—'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-600 font-medium">
                        {formatDetails(log.details)}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-400 font-mono">
                        {log.ipAddress || '127.0.0.1'}
                      </td>

                      <td className="py-3.5 px-4 text-right text-xs text-gray-500">
                        {new Date(log.createdAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActivityLogs;
