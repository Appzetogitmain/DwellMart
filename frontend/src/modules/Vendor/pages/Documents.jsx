import { useState, useEffect, useCallback } from "react";
import { FiFile, FiUpload, FiDownload, FiTrash2, FiInfo } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ConfirmModal from "../../Admin/components/ConfirmModal";
import Badge from "../../../shared/components/Badge";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import {
  getVendorDocuments,
  uploadVendorDocument,
  deleteVendorDocument,
} from "../services/vendorService";
import toast from "react-hot-toast";

const Documents = ({ asTab = false }) => {
  const { vendor } = useVendorAuthStore();
  const [documents, setDocuments] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });
  const [showUpload, setShowUpload] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const vendorId = vendor?.id || vendor?._id;

  const fetchDocuments = useCallback(async () => {
    if (!vendorId) return;
    setIsLoading(true);
    try {
      const res = await getVendorDocuments();
      const data = res?.data ?? res;
      setDocuments(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (docData, file) => {
    setIsSaving(true);
    try {
      await uploadVendorDocument(docData, file);
      setShowUpload(false);
      toast.success("Document uploaded");
      fetchDocuments();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.id) return;
    setIsSaving(true);
    try {
      await deleteVendorDocument(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null });
      toast.success("Document deleted");
      fetchDocuments();
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    { key: "name", label: "Document Name", sortable: true },
    { key: "category", label: "Category", sortable: true },
    {
      key: "status",
      label: "Status",
      render: (value) => (
        <Badge
          variant={
            value === "approved"
              ? "success"
              : value === "rejected"
                ? "error"
                : "warning"
          }
        >
          {value}
        </Badge>
      ),
    },
    {
      key: "expiryDate",
      label: "Expiry Date",
      render: (value) => (value ? new Date(value).toLocaleDateString() : "N/A"),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => window.open(row.fileUrl, "_blank")}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Download"
          >
            <FiDownload />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row._id })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
            title="Delete"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view documents</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={asTab ? "space-y-6 max-w-full overflow-x-hidden" : "space-y-6"}
    >
      {!asTab && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="lg:hidden">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
              <FiFile className="text-primary-600" />
              Documents
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              Manage business documents and certificates
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
          >
            <FiUpload />
            <span>Upload Document</span>
          </button>
        </div>
      )}

      {asTab && (
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Your Documents</h2>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold text-sm"
          >
            <FiUpload />
            <span>Upload</span>
          </button>
        </div>
      )}

      {/* Helper Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-blue-800 font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
          <FiInfo /> What documents can I upload?
        </h4>
        <ul className="list-disc list-inside text-xs sm:text-sm text-blue-700 space-y-1">
          <li><strong>License:</strong> Trade license, business operating license, etc.</li>
          <li><strong>Certificate:</strong> ISO, quality assurance, or brand authorization certificates.</li>
          <li><strong>Tax Document:</strong> GST, VAT, PAN, or other tax identification documents.</li>
          <li>All uploaded documents are reviewed by administrators before approval.</li>
        </ul>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">Loading documents...</p>
        </div>
      ) : (
        <DataTable data={documents} columns={columns} pagination={true} />
      )}

      {showUpload && (
        <DocumentUploadForm
          onSave={handleUpload}
          onClose={() => setShowUpload(false)}
          isSaving={isSaving}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Document"
        message="Are you sure you want to delete this document?"
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

const DocumentUploadForm = ({ onSave, onClose, isSaving }) => {
  const [formData, setFormData] = useState({
    name: "",
    category: "License",
    expiryDate: "",
  });
  const [file, setFile] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    onSave(formData, file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold mb-4">Upload Document</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Document Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option>License</option>
              <option>Certificate</option>
              <option>Tax Document</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">
              Expiry Date (optional)
            </label>
            <input
              type="date"
              value={formData.expiryDate}
              onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Upload File</label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-60"
            >
              {isSaving ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Documents;
