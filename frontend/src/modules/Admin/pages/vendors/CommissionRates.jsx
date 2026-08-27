import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiEdit, FiDollarSign } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";
import { useVendorStore } from "../../store/vendorStore";
import toast from "react-hot-toast";

const CommissionRates = () => {
  const navigate = useNavigate();
  const { vendors, updateCommissionRate, initialize } = useVendorStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [commissionModal, setCommissionModal] = useState({
    isOpen: false,
    vendorId: null,
    vendorName: null,
    currentRate: "",
  });
  const [newRate, setNewRate] = useState("");

  const filteredVendors = useMemo(() => {
    let filtered = vendors.filter((v) => v.status === "approved");

    if (searchQuery) {
      filtered = filtered.filter(
        (vendor) =>
          vendor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          vendor.storeName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [vendors, searchQuery]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleCommissionUpdate = async () => {
    const rate = parseFloat(newRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast.error("Please enter a valid commission rate (0-100%)");
      return;
    }
    const success = await updateCommissionRate(commissionModal.vendorId, rate);
    if (success) {
      setCommissionModal({
        isOpen: false,
        vendorId: null,
        vendorName: null,
        currentRate: "",
      });
      setNewRate("");
      toast.success("Commission rate updated successfully");
    } else {
      toast.error("Failed to update commission rate");
    }
  };

  const columns = [
    {
      key: "id",
      label: "ID",
      sortable: true,
    },
    {
      key: "storeName",
      label: "Store Name",
      sortable: true,
      render: (value, row) => (
        <div>
          <span className="font-medium text-gray-800">{value || row.name}</span>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "commissionRate",
      label: "Current Rate",
      sortable: true,
      render: (value, row) => {
        const rate = value || row.commissionRate || 0;
        return (
          <span className="text-lg font-bold text-gray-800">
            {(rate * 100).toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge variant={value === "approved" ? "success" : "warning"}>
          {value?.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setNewRate(((row.commissionRate || 0) * 100).toFixed(1));
            setCommissionModal({
              isOpen: true,
              vendorId: row.id,
              vendorName: row.storeName || row.name,
              currentRate: ((row.commissionRate || 0) * 100).toFixed(1),
            });
          }}
          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
          title="Update Commission Rate">
          <FiEdit />
        </button>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Commission Rates
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage commission rates for approved vendors
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Search */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vendors..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              />
            </div>

            <div className="w-full sm:w-auto">
              <ExportButton
                data={filteredVendors}
                headers={[
                  { label: "ID", accessor: (row) => row.id },
                  {
                    label: "Store Name",
                    accessor: (row) => row.storeName || row.name,
                  },
                  { label: "Email", accessor: (row) => row.email },
                  {
                    label: "Commission Rate",
                    accessor: (row) =>
                      `${((row.commissionRate || 0) * 100).toFixed(1)}%`,
                  },
                ]}
                filename="vendor-commission-rates"
              />
            </div>
          </div>
        </div>

        {/* DataTable */}
        <DataTable
          data={filteredVendors}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
          onRowClick={(row) => navigate(`/admin/vendors/${row.id}`)}
        />
      </div>

      {/* Commission Update Modal */}
      <ConfirmModal
        isOpen={commissionModal.isOpen}
        onClose={() => {
          setCommissionModal({
            isOpen: false,
            vendorId: null,
            vendorName: null,
            currentRate: "",
          });
          setNewRate("");
        }}
        onConfirm={handleCommissionUpdate}
        title="Update Commission Rate"
        message={`Update commission rate for "${commissionModal.vendorName}"`}
        confirmText="Update"
        cancelText="Cancel"
        type="info"
        customContent={
          <div className="mt-4">
            <div className="mb-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Current Rate</p>
              <p className="text-lg font-bold text-gray-800 dark:text-white">
                {commissionModal.currentRate}%
              </p>
            </div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              New Commission Rate (%)
            </label>
            <input
              type="number"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
              placeholder="10.0"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter a value between 0 and 100
            </p>
          </div>
        }
      />
    </motion.div>
  );
};

export default CommissionRates;
