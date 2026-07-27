import { useState, useEffect } from 'react';
import {
  FiUsers,
  FiUserPlus,
  FiSearch,
  FiEdit,
  FiLock,
  FiTrash2,
  FiCheckCircle,
  FiXCircle,
  FiShield,
  FiRefreshCw,
  FiUserCheck,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getAllSubAdmins,
  toggleSubAdminStatus,
  deleteSubAdmin,
} from '../../services/adminService';
import { useAdminAuthStore } from '../../store/adminStore';
import ResetPasswordModal from './ResetPasswordModal';

const SubAdmins = () => {
  const navigate = useNavigate();
  const { admin: currentAdmin } = useAdminAuthStore();

  const [subAdmins, setSubAdmins] = useState([]);
  const [stats, setStats] = useState({ total: 0, superadmins: 0, subadmins: 0, active: 0, inactive: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Password Modal
  const [selectedAdminForReset, setSelectedAdminForReset] = useState(null);

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const res = await getAllSubAdmins({
        search: searchTerm,
        status: statusFilter,
        role: roleFilter,
      });
      const data = res?.data || {};
      setSubAdmins(data.admins || []);
      setStats(data.stats || { total: 0, superadmins: 0, subadmins: 0, active: 0, inactive: 0 });
    } catch (err) {
      toast.error(err.message || 'Failed to fetch admin users.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, [statusFilter, roleFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAdmins();
  };

  const handleToggleStatus = async (adminItem) => {
    if (adminItem._id === currentAdmin?._id) {
      toast.error('You cannot disable your own Super Admin account.');
      return;
    }
    if (adminItem.role === 'superadmin') {
      toast.error('Super Admin status cannot be toggled.');
      return;
    }

    const nextStatus = adminItem.status === 'active' ? 'inactive' : 'active';
    try {
      await toggleSubAdminStatus(adminItem._id, nextStatus);
      toast.success(`Account status set to ${nextStatus.toUpperCase()} for ${adminItem.name}`);
      fetchAdmins();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle status.');
    }
  };

  const handleDelete = async (adminItem) => {
    if (adminItem._id === currentAdmin?._id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    if (adminItem.role === 'superadmin') {
      toast.error('Super Admin accounts cannot be deleted.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete Sub Admin "${adminItem.name}"?`)) {
      return;
    }

    try {
      await deleteSubAdmin(adminItem._id);
      toast.success('Sub Admin deleted successfully.');
      fetchAdmins();
    } catch (err) {
      toast.error(err.message || 'Failed to delete Sub Admin.');
    }
  };

  // Helper to format permission badges
  const renderPermissionBadges = (adminItem) => {
    if (adminItem.role === 'superadmin') {
      return (
        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
          Unrestricted Access
        </span>
      );
    }

    const perms = adminItem.permissions || [];
    if (perms.length === 0) {
      return <span className="text-xs text-gray-400">No permissions</span>;
    }

    // Extract unique module prefixes
    const modules = Array.from(new Set(perms.map((p) => p.split('.')[0])));
    const displayModules = modules.slice(0, 3);
    const extraCount = modules.length - 3;

    return (
      <div className="flex flex-wrap items-center gap-1">
        {displayModules.map((m) => (
          <span
            key={m}
            className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[11px] font-medium capitalize"
          >
            {m}
          </span>
        ))}
        {extraCount > 0 && (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[11px] font-medium">
            +{extraCount} more
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
            <FiShield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Admin Users & Management
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Manage Sub Admin accounts, assign module permissions, and control access levels
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/admin/subadmins/create')}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
        >
          <FiUserPlus className="w-4 h-4" />
          <span>Create Sub Admin</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
            <FiUsers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Admins</p>
            <h3 className="text-xl font-bold text-gray-900">{stats.total}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
            <FiShield className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Super Admins</p>
            <h3 className="text-xl font-bold text-gray-900">{stats.superadmins}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
            <FiUserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Active Sub Admins</p>
            <h3 className="text-xl font-bold text-gray-900">{stats.active}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg">
            <FiXCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Inactive Sub Admins</p>
            <h3 className="text-xl font-bold text-gray-900">{stats.inactive}</h3>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none"
          >
            <option value="">All Roles</option>
            <option value="superadmin">Super Admin</option>
            <option value="subadmin">Sub Admin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            onClick={fetchAdmins}
            title="Refresh List"
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sub Admins Data Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Admin Name</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status (ON/OFF)</th>
                <th className="py-3.5 px-4">Module Permissions</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400 text-xs">
                    Loading admin users...
                  </td>
                </tr>
              ) : subAdmins.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-500 text-xs">
                    No admin users found.
                  </td>
                </tr>
              ) : (
                subAdmins.map((item) => {
                  const isSelf = item._id === currentAdmin?._id;
                  const isSuper = item.role === 'superadmin';
                  const isActive = item.status === 'active';

                  return (
                    <tr key={item._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gray-100 font-bold text-gray-700 flex items-center justify-center text-xs">
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {isSelf && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px] font-bold">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">{item.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-600 font-medium">
                        {item.phone || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        {isSuper ? (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold flex items-center gap-1 w-max">
                            <FiShield className="w-3 h-3 text-amber-600" /> Super Admin
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-800 rounded-lg text-xs font-semibold w-max block">
                            Sub Admin
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          disabled={isSelf || isSuper}
                          onClick={() => handleToggleStatus(item)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isSelf || isSuper
                              ? 'opacity-40 cursor-not-allowed bg-emerald-500'
                              : isActive
                              ? 'bg-emerald-500'
                              : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="ml-2 text-xs font-semibold text-gray-600">
                          {isActive ? 'ON' : 'OFF'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">{renderPermissionBadges(item)}</td>

                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isSuper ? (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-flex items-center gap-1">
                            <FiShield className="w-3 h-3 text-amber-600" /> Protected
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/admin/subadmins/${item._id}/edit`)}
                              className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 hover:text-primary-600 transition-colors"
                              title="Edit Sub Admin & Permissions"
                            >
                              <FiEdit className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => setSelectedAdminForReset(item)}
                              className="p-2 hover:bg-amber-50 rounded-xl text-gray-600 hover:text-amber-600 transition-colors"
                              title="Reset Password"
                            >
                              <FiLock className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDelete(item)}
                              className="p-2 hover:bg-rose-50 rounded-xl text-gray-600 hover:text-rose-600 transition-colors"
                              title="Delete Sub Admin"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Password Modal */}
      <ResetPasswordModal
        isOpen={!!selectedAdminForReset}
        onClose={() => setSelectedAdminForReset(null)}
        adminUser={selectedAdminForReset}
        onSuccess={fetchAdmins}
      />
    </div>
  );
};

export default SubAdmins;
