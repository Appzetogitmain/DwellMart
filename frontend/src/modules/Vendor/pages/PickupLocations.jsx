import { useState, useEffect } from "react";
import {
  FiMapPin,
  FiPlus,
  FiEdit,
  FiTrash2,
  FiSearch,
  FiCheckCircle,
  FiX,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ConfirmModal from "../../Admin/components/ConfirmModal";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import toast from "react-hot-toast";
import api from "../../../shared/utils/api";

const PickupLocations = () => {
  const { vendor } = useVendorAuthStore();
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationModal, setLocationModal] = useState({
    isOpen: false,
    location: null,
  });
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    locationId: null,
  });

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/vendor/pickup-locations');
        const serverLocations = res?.data?.locations || [];
        if (cancelled) return;

        // One-time migration: locations created while this screen was
        // localStorage-only would otherwise be silently discarded.
        const legacyKey = `vendor-${vendorId}-pickup-locations`;
        const legacyRaw = localStorage.getItem(legacyKey);
        if (serverLocations.length === 0 && legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw);
            if (Array.isArray(legacy) && legacy.length > 0) {
              await api.post('/vendor/pickup-locations/import', { locations: legacy });
              localStorage.removeItem(legacyKey);
              const after = await api.get('/vendor/pickup-locations');
              if (!cancelled) setLocations(after?.data?.locations || []);
              toast.success('Your saved pickup locations have been migrated to your account.');
              return;
            }
          } catch {
            // A malformed legacy blob must not block the screen.
          }
        }

        setLocations(serverLocations);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error?.response?.data?.message || 'Could not load pickup locations.'
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const filteredLocations = locations.filter(
    (loc) =>
      !searchQuery ||
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.address.street.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.address.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // All mutations now go to the server. These previously wrote to
  // `localStorage`, so a vendor's pickup locations existed only in one browser
  // profile and were lost on a cache clear — with a PickupLocation model on the
  // backend that no code imported.
  const refresh = async () => {
    const res = await api.get('/vendor/pickup-locations');
    setLocations(res?.data?.locations || []);
  };

  const withError = async (fn, successMessage) => {
    try {
      await fn();
      await refresh();
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error(
        error?.response?.data?.message || error?.message || 'Something went wrong.'
      );
    }
  };

  const handleSave = (locationData) => {
    const editingId = locationModal.location?._id || locationModal.location?.id;
    return withError(async () => {
      if (editingId) {
        await api.put(`/vendor/pickup-locations/${editingId}`, locationData);
      } else {
        await api.post('/vendor/pickup-locations', locationData);
      }
      setLocationModal({ isOpen: false, location: null });
    }, editingId ? 'Location updated' : 'Location added');
  };

  const handleDelete = () =>
    withError(async () => {
      await api.delete(`/vendor/pickup-locations/${deleteModal.locationId}`);
      setDeleteModal({ isOpen: false, locationId: null });
    }, 'Location deleted');

  const toggleActive = (locationId) => {
    const current = locations.find((l) => (l._id || l.id) === locationId);
    return withError(
      () => api.put(`/vendor/pickup-locations/${locationId}`, { isActive: !current?.isActive }),
      'Location status updated'
    );
  };

  const setDefault = (locationId) =>
    withError(
      () => api.patch(`/vendor/pickup-locations/${locationId}/default`),
      'Default location updated'
    );

  const columns = [
    {
      key: "name",
      label: "Location Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <FiMapPin className="text-primary-600" />
          <div>
            <span className="font-medium">{value}</span>
            {row.isDefault && (
              <span className="ml-2 text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded">
                Default
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "address",
      label: "Address",
      sortable: false,
      render: (value) => (
        <div className="text-sm">
          <p>{value.street}</p>
          <p className="text-gray-500">
            {value.city}, {value.state} {value.zipCode}
          </p>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Contact",
      sortable: false,
      render: (value, row) => (
        <div className="text-sm">
          <p>{value}</p>
          <p className="text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${value ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
            }`}>
          {value ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocationModal({ isOpen: true, location: row })}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <FiEdit />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, locationId: row._id || row.id })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          Please log in to manage pickup locations
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Pickup Locations
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage your store pickup locations
          </p>
        </div>
        <button
          onClick={() => setLocationModal({ isOpen: true, location: null })}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold">
          <FiPlus />
          <span>Add Location</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search locations..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Locations Table */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {filteredLocations.length > 0 ? (
          <DataTable
            data={filteredLocations}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        ) : (
          <div className="text-center py-12">
            <FiMapPin className="mx-auto text-4xl text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No pickup locations found</p>
            <button
              onClick={() => setLocationModal({ isOpen: true, location: null })}
              className="px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold">
              Add Your First Location
            </button>
          </div>
        )}
      </div>

      {/* Location Modal */}
      <LocationModal
        isOpen={locationModal.isOpen}
        location={locationModal.location}
        onClose={() => setLocationModal({ isOpen: false, location: null })}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, locationId: null })}
        onConfirm={handleDelete}
        title="Delete Location?"
        message="Are you sure you want to delete this pickup location? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

// Location Modal Component
const LocationModal = ({ isOpen, location, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: "",
    address: {
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "USA",
    },
    phone: "",
    email: "",
    isActive: true,
    isDefault: false,
    operatingHours: {
      monday: { open: "09:00", close: "18:00", closed: false },
      tuesday: { open: "09:00", close: "18:00", closed: false },
      wednesday: { open: "09:00", close: "18:00", closed: false },
      thursday: { open: "09:00", close: "18:00", closed: false },
      friday: { open: "09:00", close: "18:00", closed: false },
      saturday: { open: "10:00", close: "16:00", closed: false },
      sunday: { open: "10:00", close: "16:00", closed: true },
    },
  });

  useEffect(() => {
    if (location) {
      setFormData(location);
    } else {
      setFormData({
        name: "",
        address: {
          street: "",
          city: "",
          state: "",
          zipCode: "",
          country: "USA",
        },
        phone: "",
        email: "",
        isActive: true,
        isDefault: false,
        operatingHours: {
          monday: { open: "09:00", close: "18:00", closed: false },
          tuesday: { open: "09:00", close: "18:00", closed: false },
          wednesday: { open: "09:00", close: "18:00", closed: false },
          thursday: { open: "09:00", close: "18:00", closed: false },
          friday: { open: "09:00", close: "18:00", closed: false },
          saturday: { open: "10:00", close: "16:00", closed: false },
          sunday: { open: "10:00", close: "16:00", closed: true },
        },
      });
    }
  }, [location, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("address.")) {
      const field = name.split(".")[1];
      setFormData({
        ...formData,
        address: { ...formData.address, [field]: value },
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.address.street || !formData.address.city) {
      toast.error("Please fill in all required fields");
      return;
    }
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-800">
                    {location ? "Edit Location" : "Add Pickup Location"}
                  </h2>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <FiX className="text-gray-500" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., Main Store, Warehouse"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Street Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address.street"
                    value={formData.address.street}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="address.city"
                      value={formData.address.city}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      name="address.state"
                      value={formData.address.state}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Zip Code
                    </label>
                    <input
                      type="text"
                      name="address.zipCode"
                      value={formData.address.zipCode}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Country
                    </label>
                    <input
                      type="text"
                      name="address.country"
                      value={formData.address.country}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">
                      Active Location
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isDefault: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">
                      Set as Default
                    </span>
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold">
                    {location ? "Update Location" : "Add Location"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PickupLocations;
