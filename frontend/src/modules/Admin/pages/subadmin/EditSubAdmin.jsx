import { useState, useEffect } from 'react';
import {
  FiEdit,
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiShield,
  FiSliders,
} from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getSubAdminById,
  updateSubAdmin,
  getAllSubAdmins,
} from '../../services/adminService';
import {
  ALL_PERMISSIONS,
  PRESET_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_DEPENDENCIES,
} from '../../config/permissions';

const EditSubAdmin = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'active',
    role: 'subadmin',
  });

  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [activePreset, setActivePreset] = useState('custom');

  const [openGroups, setOpenGroups] = useState(
    PERMISSION_GROUPS.reduce((acc, g) => ({ ...acc, [g.id]: true }), {})
  );

  const [existingAdmins, setExistingAdmins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [targetRes, listRes] = await Promise.all([
          getSubAdminById(id),
          getAllSubAdmins({ role: 'subadmin' }),
        ]);

        const adminData = targetRes?.data || {};
        setFormData({
          name: adminData.name || '',
          email: adminData.email || '',
          phone: adminData.phone || '',
          status: adminData.status || 'active',
          role: adminData.role || 'subadmin',
        });
        setSelectedPermissions(adminData.permissions || []);

        const list = listRes?.data?.admins || [];
        setExistingAdmins(list.filter((a) => a._id !== id));
      } catch (err) {
        toast.error(err.message || 'Failed to load Sub Admin details.');
        navigate('/admin/subadmins');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const togglePermission = (key) => {
    setActivePreset('custom');
    setSelectedPermissions((prev) => {
      const exists = prev.includes(key);

      if (exists) {
        const toRemove = new Set([key]);
        for (const [actionPerm, viewPerm] of Object.entries(PERMISSION_DEPENDENCIES)) {
          if (viewPerm === key) {
            toRemove.add(actionPerm);
          }
        }
        return prev.filter((p) => !toRemove.has(p));
      } else {
        const toAdd = new Set([key]);
        const dep = PERMISSION_DEPENDENCIES[key];
        if (dep) toAdd.add(dep);
        return Array.from(new Set([...prev, ...toAdd]));
      }
    });
  };

  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const preset = PRESET_ROLES[presetKey];
    if (preset) {
      setSelectedPermissions([...preset.permissions]);
    }
  };

  const handleCopyPermissions = (adminId) => {
    if (!adminId) return;
    const target = existingAdmins.find((a) => a._id === adminId);
    if (target && target.permissions) {
      setSelectedPermissions([...target.permissions]);
      setActivePreset('custom');
      toast.success(`Copied ${target.permissions.length} permissions from ${target.name}!`);
    }
  };

  const toggleSelectAllGlobal = () => {
    const allNonSuper = ALL_PERMISSIONS.filter((p) => !p.startsWith('subadmin.'));
    if (selectedPermissions.length === allNonSuper.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions([...allNonSuper]);
    }
    setActivePreset('custom');
  };

  const toggleSelectAllGroup = (group) => {
    const groupKeys = group.permissions.map((p) => p.key);
    const allGroupSelected = groupKeys.every((k) => selectedPermissions.includes(k));

    if (allGroupSelected) {
      setSelectedPermissions((prev) => prev.filter((k) => !groupKeys.includes(k)));
    } else {
      const next = new Set([...selectedPermissions, ...groupKeys]);
      for (const k of groupKeys) {
        if (PERMISSION_DEPENDENCIES[k]) {
          next.add(PERMISSION_DEPENDENCIES[k]);
        }
      }
      setSelectedPermissions(Array.from(next));
    }
    setActivePreset('custom');
  };

  const toggleGroupOpen = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) return toast.error('Name is required.');

    setIsSubmitting(true);
    try {
      await updateSubAdmin(id, {
        name: formData.name,
        phone: formData.phone,
        status: formData.status,
        permissions: selectedPermissions,
      });
      toast.success(`Sub Admin "${formData.name}" updated successfully!`);
      navigate('/admin/subadmins');
    } catch (err) {
      toast.error(err.message || 'Failed to update Sub Admin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-gray-500 text-sm font-medium">
        Loading Sub Admin details...
      </div>
    );
  }

  const allNonSuperKeys = ALL_PERMISSIONS.filter((p) => !p.startsWith('subadmin.'));
  const isGlobalAllSelected = selectedPermissions.length === allNonSuperKeys.length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/subadmins')}
            className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
            <FiEdit className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Edit Sub Admin: {formData.name}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              {formData.email} • Manage permissions and account status
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account Info Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h2 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-3 flex items-center gap-2">
            <FiShield className="text-primary-600" /> Account Details & Status
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address (Read Only)
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. +91 9876543210"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Account Status (ON / OFF)
              </label>
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      status: prev.status === 'active' ? 'inactive' : 'active',
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs font-bold text-gray-700 uppercase">
                  {formData.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Role Presets & Cloning Bar */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3">
            <div>
              <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <FiSliders className="text-primary-600" /> Quick Role Presets
              </h2>
              <p className="text-xs text-gray-500">
                Select a preset role or customize module permissions below
              </p>
            </div>

            {existingAdmins.length > 0 && (
              <div className="flex items-center gap-2">
                <FiCopy className="text-gray-400 w-4 h-4" />
                <select
                  onChange={(e) => handleCopyPermissions(e.target.value)}
                  defaultValue=""
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none"
                >
                  <option value="" disabled>
                    Copy Permissions From...
                  </option>
                  {existingAdmins.map((adm) => (
                    <option key={adm._id} value={adm._id}>
                      {adm.name} ({adm.permissions?.length || 0} perms)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            {Object.entries(PRESET_ROLES).map(([key, preset]) => {
              const isSelected = activePreset === key;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-primary-600 text-white border-primary-600 shadow-md ring-2 ring-primary-300'
                      : 'bg-gray-50/70 border-gray-200 text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <span className="font-bold text-xs">{preset.name}</span>
                  <span
                    className={`text-[10px] mt-1 line-clamp-2 ${
                      isSelected ? 'text-primary-100' : 'text-gray-400'
                    }`}
                  >
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Select All */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <span className="font-bold text-gray-900 text-sm">
            Assigned Permissions: {selectedPermissions.length} of {allNonSuperKeys.length}
          </span>

          <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
            <input
              type="checkbox"
              checked={isGlobalAllSelected}
              onChange={toggleSelectAllGlobal}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <span className="text-xs font-semibold text-gray-800">
              Select All Permissions
            </span>
          </label>
        </div>

        {/* Collapsible Permission Groups */}
        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => {
            const groupKeys = group.permissions.map((p) => p.key);
            const selectedInGroup = groupKeys.filter((k) => selectedPermissions.includes(k));
            const isGroupAllSelected = groupKeys.length > 0 && selectedInGroup.length === groupKeys.length;
            const isOpen = openGroups[group.id];

            return (
              <div
                key={group.id}
                className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden"
              >
                <div className="p-4 bg-gray-50/70 flex items-center justify-between gap-4">
                  <div
                    onClick={() => toggleGroupOpen(group.id)}
                    className="flex items-center gap-3 cursor-pointer flex-1"
                  >
                    <button type="button" className="text-gray-400 hover:text-gray-600">
                      {isOpen ? <FiChevronUp className="w-5 h-5" /> : <FiChevronDown className="w-5 h-5" />}
                    </button>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                        <span>{group.name}</span>
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-[11px] rounded-full font-medium">
                          {selectedInGroup.length} / {groupKeys.length}
                        </span>
                      </h3>
                      <p className="text-xs text-gray-500">{group.description}</p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-gray-200">
                    <input
                      type="checkbox"
                      checked={isGroupAllSelected}
                      onChange={() => toggleSelectAllGroup(group)}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-xs font-semibold text-gray-700">
                      Select All
                    </span>
                  </label>
                </div>

                {isOpen && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-gray-100">
                    {group.permissions.map((permItem) => {
                      const isChecked = selectedPermissions.includes(permItem.key);
                      return (
                        <label
                          key={permItem.key}
                          className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-primary-50/60 border-primary-200 text-primary-950 font-semibold'
                              : 'bg-gray-50/40 border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(permItem.key)}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                          />
                          <span className="text-xs">{permItem.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate('/admin/subadmins')}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <FiCheck className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving Changes...' : 'Save Permissions'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditSubAdmin;
