import { useState, useEffect } from 'react';
import { FiList, FiX, FiDownload, FiCheckCircle, FiXCircle, FiClock, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getBulkProductImportHistory } from '../../modules/Admin/services/adminService';
import { getVendorBulkProductImportHistory } from '../../modules/Vendor/services/vendorService';

const ImportHistoryModal = ({ isOpen, onClose, mode = 'admin' }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const res = mode === 'admin'
                ? await getBulkProductImportHistory()
                : await getVendorBulkProductImportHistory();

            const data = res?.data || res;
            setHistory(data.history || []);
        } catch (err) {
            toast.error('Failed to load import history.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100 animate-fadeIn">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary-100 text-primary-600 rounded-xl">
                            <FiList className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">Bulk Import Audit History</h2>
                            <p className="text-xs text-gray-500">Past product upload jobs, logs, and downloadable reports</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                {/* Table */}
                <div className="p-6 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                            <FiRefreshCw className="w-8 h-8 animate-spin text-primary-600" />
                            <p className="text-sm font-medium">Loading history...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">
                            No bulk import history found.
                        </div>
                    ) : (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-100 text-gray-700 font-semibold">
                                    <tr>
                                        <th className="p-3">File Name</th>
                                        <th className="p-3">Uploaded By</th>
                                        <th className="p-3">Total Rows</th>
                                        <th className="p-3">Imported</th>
                                        <th className="p-3">Updated</th>
                                        <th className="p-3">Skipped</th>
                                        <th className="p-3">Failed</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-center">Reports</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {history.map((item) => (
                                        <tr key={item._id} className="hover:bg-gray-50/80">
                                            <td className="p-3 font-semibold text-gray-800">{item.fileName}</td>
                                            <td className="p-3 text-gray-600">
                                                {item.uploadedBy?.name || 'User'} ({item.uploadedBy?.role})
                                            </td>
                                            <td className="p-3 font-medium">{item.totalRows}</td>
                                            <td className="p-3 text-emerald-600 font-bold">{item.importedCount}</td>
                                            <td className="p-3 text-blue-600 font-bold">{item.updatedCount}</td>
                                            <td className="p-3 text-amber-600 font-bold">{item.skippedCount}</td>
                                            <td className="p-3 text-red-600 font-bold">{item.failedCount}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    item.status === 'completed'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : item.status === 'failed'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {item.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {item.errorFileUrl && (
                                                        <a
                                                            href={item.errorFileUrl}
                                                            download
                                                            className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                            title="Download Error Report">
                                                            <FiDownload />
                                                        </a>
                                                    )}
                                                    {item.validFileUrl && (
                                                        <a
                                                            href={item.validFileUrl}
                                                            download
                                                            className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                                                            title="Download Valid Rows">
                                                            <FiDownload />
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportHistoryModal;
