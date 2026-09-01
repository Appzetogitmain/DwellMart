import { useState, useEffect } from "react";
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiEye, FiEyeOff, FiUploadCloud } from "react-icons/fi";
import { motion } from "framer-motion";
import { useBrandStore } from "../../../../shared/store/brandStore";
import BrandForm from "../../components/Brands/BrandForm";
import BrandImportModal from "../../components/Brands/BrandImportModal";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import ConfirmModal from "../../components/ConfirmModal";
import AnimatedSelect from "../../components/AnimatedSelect";

const ManageBrands = () => {
  const { brands, initialize, deleteBrand, toggleBrandStatus } = useBrandStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });

  useEffect(() => {
    initialize();
  }, []);

  const filteredBrands = brands.filter((brand) => {
    const matchesSearch =
      !searchQuery ||
      brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (brand.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "active" && brand.isActive) ||
      (selectedStatus === "inactive" && !brand.isActive);

    return matchesSearch && matchesStatus;
  });

  const handleCreate = () => {
    setEditingBrand(null);
    setShowForm(true);
  };

  const handleEdit = (brand) => {
    setEditingBrand(brand);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    setDeleteModal({ isOpen: true, id });
  };

  const confirmDelete = () => {
    deleteBrand(deleteModal.id);
    setDeleteModal({ isOpen: false, id: null });
  };

  const columns = [
    {
      key: "name",
      label: "Brand Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          {row.logo && (
            <img
              src={row.logo}
              alt={value}
              className="w-10 h-10 object-cover rounded-lg"
            />
          )}
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${value ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
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
            onClick={() => toggleBrandStatus(row.id)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={row.isActive ? "Deactivate" : "Activate"}>
            {row.isActive ? <FiEyeOff /> : <FiEye />}
          </button>
          <button
            onClick={() => handleEdit(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <FiEdit />
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Manage Brands
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View and manage product brands
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold text-sm shadow-sm"
          >
            <FiUploadCloud />
            <span>Import Brands</span>
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
          >
            <FiPlus />
            <span>Add Brand</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search brands..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>

          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />
        </div>

        <div className="mt-4 flex items-center justify-start sm:justify-end gap-2 flex-wrap">
          <ExportButton
            data={filteredBrands}
            headers={[
              { label: "ID", accessor: (row) => row.id },
              { label: "Name", accessor: (row) => row.name },
              {
                label: "Status",
                accessor: (row) => (row.isActive ? "Active" : "Inactive"),
              },
            ]}
            filename="brands"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={filteredBrands}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      </div>

      {showForm && (
        <BrandForm
          brand={editingBrand}
          onClose={() => {
            setShowForm(false);
            setEditingBrand(null);
          }}
          onSave={() => {
            initialize();
            setShowForm(false);
            setEditingBrand(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={confirmDelete}
        title="Delete Brand?"
        message="Are you sure you want to delete this brand? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      <BrandImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          initialize();
        }}
      />
    </motion.div>
  );
};

export default ManageBrands;
