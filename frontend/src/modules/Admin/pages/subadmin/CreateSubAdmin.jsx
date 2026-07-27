import { useState, useEffect } from 'react';
import {
  FiUserPlus,
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiShield,
  FiLock,
  FiSliders,
  FiEye,
  FiEyeOff,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  createSubAdmin,
  getAllSubAdmins,
} from '../../services/adminService';
import {
  ALL_PERMISSIONS,
  PRESET_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_DEPENDENCIES,
} from '../../config/permissions';

const CreateSubAdmin = () => {
  const navigate = useNavigate();

  // Password Visibility Toggle State
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Account Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    status: 'active',
    role: 'subadmin',
  });

  // Selected Permissions Array
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [activePreset, setActivePreset] = useState('custom');

  // Collapsible cards open state
  const [openGroups, setOpenGroups] = useState(
    PERMISSION_GROUPS.reduce((acc, g) => ({ ...acc, [g.id]: true }), {})
  );

  // Existing admins list for Copy Permissions
  const [existingAdmins, setExistingAdmins] = useState([]);

  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Fetch subadmins for "Copy Permissions From" dropdown
    getAllSubAdmins({ role: 'subadmin' })
      .then((res) => {
        const list = res?.data?.admins || [];
        setExistingAdmins(list);
      })
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Toggle single permission with auto-dependency handling
  const togglePermission = (key) => {
    setActivePreset('custom');
    setSelectedPermissions((prev) => {
      const exists = prev.includes(key);

      if (exists) {
        // Removing permission -> remove it AND any permission that depends on it
        const toRemove = new Set([key]);
        for (const [actionPerm, viewPerm] of Object.entries(PERMISSION_DEPENDENCIES)) {
          if (viewPerm === key) {
            toRemove.add(actionPerm);
          }
        }
        return prev.filter((p) => !toRemove.has(p));
      } else {
        // Adding permission -> add it AND any required view dependency
        const toAdd = new Set([key]);
        const dep = PERMISSION_DEPENDENCIES[key];
        if (dep) toAdd.add(dep);
        return Array.from(new Set([...prev, ...toAdd]));
      }
    });
  };

  // Preset Selection
  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const preset = PRESET_ROLES[presetKey];
    if (preset) {
      setSelectedPermissions([...preset.permissions]);
    }
  };

  // Copy Permissions from Existing Sub Admin
  const handleCopyPermissions = (adminId) => {
    if (!adminId) return;
    const target = existingAdmins.find((a) => a._id === adminId);
    if (target && target.permissions) {
      setSelectedPermissions([...target.permissions]);
      setActivePreset('custom');
      toast.success(`Copied ${target.permissions.length} permissions from ${target.name}!`);
    }
  };

  // Global Select All / Clear All
  const toggleSelectAllGlobal = () => {
    const allNonSuper = ALL_PERMISSIONS.filter((p) => !p.startsWith('subadmin.'));
    if (selectedPermissions.length === allNonSuper.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions([...allNonSuper]);
    }
    setActivePreset('custom');
  };

  // Module Group Select All
  const toggleSelectAllGroup = (group) => {
    const groupKeys = group.permissions.map((p) => p.key);
    const allGroupSelected = groupKeys.every((k) => selectedPermissions.includes(k));

    if (allGroupSelected) {
      // Remove all group keys and their dependents
      setSelectedPermissions((prev) => prev.filter((k) => !groupKeys.includes(k)));
    } else {
      // Add all group keys with dependencies
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
    if (!formData.email.trim()) return toast.error('Email is required.');
    if (!formData.password) return toast.error('Password is required.');
    if (formData.password.length < 6) return toast.error('Password must be at least 6 characters.');
    if (formData.password !== formData.confirmPassword) return toast.error('Passwords do not match.');

    setIsSubmitting(true);
    try {
      await createSubAdmin({
        ...formData,
        permissions: selectedPermissions,
      });
      toast.success(`Sub Admin "${formData.name}" created successfully!`);
      navigate('/admin/subadmins');
    } catch (err) {
      toast.error(err.message || 'Failed to create Sub Admin.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <FiUserPlus className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Create New Sub Admin
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Configure credentials, preset roles, and fine-grained module access controls
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account Information Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h2 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-3 flex items-center gap-2">
            <FiShield className="text-primary-600" /> Account Credentials & Status
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
                placeholder="e.g. Rahul Sharma"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g. rahul.support@dwellmart.com"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
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

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min 6 characters"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm password"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 transition-colors"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
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
                Select a pre-configured role template or customize individual permissions below
              </p>
            </div>

            {/* Copy Permissions From Existing Admin */}
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

          {/* Preset Buttons */}
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

        {/* Permissions Configuration Header */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-bold text-gray-900 text-sm">
              Assigned Permissions: {selectedPermissions.length} of {allNonSuperKeys.length}
            </span>
          </div>

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
                {/* Group Header */}
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

                {/* Group Permissions Checkboxes */}
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

        {/* Submit Actions Bar */}
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
            <span>{isSubmitting ? 'Creating Sub Admin...' : 'Create Sub Admin'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateSubAdmin;
