import { useState, useEffect } from 'react';
import {
    FiUploadCloud,
    FiFileText,
    FiCheckCircle,
    FiAlertTriangle,
    FiXCircle,
    FiDownload,
    FiX,
    FiTrash2,
    FiRefreshCw,
    FiList,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
    validateBulkProductUpload,
    processBulkProductUpload,
    getBulkProductJobProgress,
    cancelBulkProductJob,
    downloadProductTemplate,
} from '../../modules/Admin/services/adminService';
import {
    validateVendorBulkProductUpload,
    processVendorBulkProductUpload,
    getVendorBulkProductJobProgress,
    cancelVendorBulkProductJob,
    downloadVendorProductTemplate,
} from '../../modules/Vendor/services/vendorService';

const BulkUploadModal = ({ isOpen, onClose, mode = 'admin', onSuccess, vendors = [] }) => {
    const [step, setStep] = useState(1);
    const [selectedVendorId, setSelectedVendorId] = useState('');
    const [autoCreateBrands, setAutoCreateBrands] = useState(false);
    const [duplicateMode, setDuplicateMode] = useState('skip');

    const [excelFile, setExcelFile] = useState(null);
    const [zipFile, setZipFile] = useState(null);

    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [previewRows, setPreviewRows] = useState([]);

    const [jobId, setJobId] = useState(null);
    const [jobProgress, setJobProgress] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            resetState();
        }
    }, [isOpen]);

    // Poll job progress if jobId exists
    useEffect(() => {
        let interval = null;
        if (jobId && isProcessing) {
            interval = setInterval(async () => {
                try {
                    const res = mode === 'admin'
                        ? await getBulkProductJobProgress(jobId)
                        : await getVendorBulkProductJobProgress(jobId);

                    const data = res?.data || res;
                    setJobProgress(data);

                    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                        setIsProcessing(false);
                        clearInterval(interval);
                        if (data.status === 'completed') {
                            toast.success('Bulk product import completed!');
                            if (onSuccess) onSuccess();
                        } else if (data.status === 'cancelled') {
                            toast.error('Import job was cancelled.');
                        }
                    }
                } catch (err) {
                    console.error('Error polling job:', err);
                }
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [jobId, isProcessing, mode]);

    const resetState = () => {
        setStep(1);
        setSelectedVendorId('');
        setAutoCreateBrands(false);
        setDuplicateMode('skip');
        setExcelFile(null);
        setZipFile(null);
        setIsValidating(false);
        setValidationResult(null);
        setPreviewRows([]);
        setJobId(null);
        setJobProgress(null);
        setIsProcessing(false);
    };

    if (!isOpen) return null;

    const handleDownloadTemplate = async (format) => {
        try {
            if (mode === 'admin') {
                await downloadProductTemplate(format);
            } else {
                await downloadVendorProductTemplate(format);
            }
            toast.success(`Downloaded sample ${format.toUpperCase()} template.`);
        } catch (err) {
            toast.error('Failed to download template.');
        }
    };

    const handleValidateUpload = async () => {
        if (!excelFile) {
            toast.error('Please select a CSV or Excel file to upload.');
            return;
        }

        try {
            setIsValidating(true);
            const formData = new FormData();
            formData.append('file', excelFile);
            if (zipFile) formData.append('imagesZip', zipFile);
            if (selectedVendorId) formData.append('targetVendorId', selectedVendorId);
            formData.append('autoCreateBrands', autoCreateBrands);

            const response = mode === 'admin'
                ? await validateBulkProductUpload(formData)
                : await validateVendorBulkProductUpload(formData);

            const data = response?.data || response;
            setValidationResult(data);
            setPreviewRows(data.rows || []);
            setStep(3); // Go to preview
            toast.success(`Validated ${data.totalRows} rows cleanly.`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to validate file.');
        } finally {
            setIsValidating(false);
        }
    };

    const handleRemoveRow = (rowNumber) => {
        const updated = previewRows.filter((r) => r.rowNumber !== rowNumber);
        setPreviewRows(updated);
        toast.success(`Removed row ${rowNumber} from import list.`);
    };

    const handleExecuteImport = async () => {
        if (previewRows.length === 0) {
            toast.error('No rows available to import.');
            return;
        }

        try {
            setIsProcessing(true);
            setStep(5); // Progress step

            const payload = {
                rows: previewRows,
                duplicateMode,
                targetVendorId: selectedVendorId || null,
                autoCreateBrands,
                fileName: excelFile?.name || 'import.xlsx',
                fileSize: excelFile?.size || 0,
            };

            const response = mode === 'admin'
                ? await processBulkProductUpload(payload)
                : await processVendorBulkProductUpload(payload);

            const data = response?.data || response;
            setJobId(data.jobId);
        } catch (err) {
            setIsProcessing(false);
            toast.error(err.response?.data?.message || 'Failed to start import job.');
        }
    };

    const handleCancelImport = async () => {
        if (!jobId) return;
        try {
            if (mode === 'admin') {
                await cancelBulkProductJob(jobId);
            } else {
                await cancelVendorBulkProductJob(jobId);
            }
            toast.success('Cancellation requested.');
        } catch (err) {
            toast.error('Failed to cancel job.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-border-light animate-fadeIn">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary-100 text-primary-600 rounded-xl">
                            <FiUploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-content">Bulk Product Upload</h2>
                            <p className="text-xs text-content-muted">Upload hundreds of products cleanly via Excel or CSV</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-content-muted hover:text-content rounded-lg transition-colors">
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                {/* Stepper Indicator */}
                <div className="px-6 py-3 bg-surface border-b border-border-light flex items-center justify-between text-xs font-semibold">
                    <div className={`flex items-center gap-2 ${step >= 1 ? 'text-brand-primary' : 'text-content-muted'}`}>
                        <span className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center border border-primary-200">1</span>
                        <span>Template</span>
                    </div>
                    <div className="w-8 h-[2px] bg-border" />
                    <div className={`flex items-center gap-2 ${step >= 2 ? 'text-brand-primary' : 'text-content-muted'}`}>
                        <span className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center border border-primary-200">2</span>
                        <span>Upload File</span>
                    </div>
                    <div className="w-8 h-[2px] bg-border" />
                    <div className={`flex items-center gap-2 ${step >= 3 ? 'text-brand-primary' : 'text-content-muted'}`}>
                        <span className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center border border-primary-200">3</span>
                        <span>Dry-Run Preview</span>
                    </div>
                    <div className="w-8 h-[2px] bg-border" />
                    <div className={`flex items-center gap-2 ${step >= 4 ? 'text-brand-primary' : 'text-content-muted'}`}>
                        <span className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center border border-primary-200">4</span>
                        <span>Strategy</span>
                    </div>
                    <div className="w-8 h-[2px] bg-border" />
                    <div className={`flex items-center gap-2 ${step >= 5 ? 'text-brand-primary' : 'text-content-muted'}`}>
                        <span className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center border border-primary-200">5</span>
                        <span>Import & Summary</span>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* STEP 1: Download Templates & Setup */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 flex items-start gap-3 text-sm text-blue-800">
                                <FiFileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Step 1: Download Official Template</p>
                                    <p className="text-xs text-blue-600 mt-1">
                                        Use our pre-formatted spreadsheet template with predefined columns for Category, Brand, Price, Variants, and Multi-Images.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => handleDownloadTemplate('excel')}
                                    className="flex items-center justify-center gap-3 p-4 border border-brand-primary/20 bg-status-successBg rounded-xl hover:bg-status-successBg/70 transition-colors text-status-success font-semibold text-sm">
                                    <FiDownload className="w-5 h-5" />
                                    Download Sample Excel (.xlsx)
                                </button>
                                <button
                                    onClick={() => handleDownloadTemplate('csv')}
                                    className="flex items-center justify-center gap-3 p-4 border border-status-info/20 bg-status-infoBg rounded-xl hover:bg-status-infoBg/70 transition-colors text-status-info font-semibold text-sm">
                                    <FiDownload className="w-5 h-5" />
                                    Download Sample CSV (.csv)
                                </button>
                            </div>

                            {mode === 'admin' && vendors.length > 0 && (
                                <div className="bg-surface-muted rounded-xl p-4 border border-border">
                                    <label className="block text-xs font-semibold text-content-secondary mb-2">
                                        Target Store / Vendor Selection (Optional):
                                    </label>
                                    <select
                                        value={selectedVendorId}
                                        onChange={(e) => setSelectedVendorId(e.target.value)}
                                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none">
                                        <option value="">-- Use Vendor Email Column in File --</option>
                                        {vendors.map((v) => (
                                            <option key={v._id || v.id} value={v._id || v.id}>
                                                {v.storeName || v.name} ({v.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="autoCreateBrands"
                                    checked={autoCreateBrands}
                                    onChange={(e) => setAutoCreateBrands(e.target.checked)}
                                    className="w-4 h-4 text-primary-600 rounded border-border focus:ring-brand-primary"
                                />
                                <label htmlFor="autoCreateBrands" className="text-sm font-medium text-content-secondary cursor-pointer">
                                    Automatically create missing brands during import
                                </label>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-border-light">
                                <button
                                    onClick={() => setStep(2)}
                                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors">
                                    Next: Upload File →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: File Upload */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-content-secondary mb-2">
                                    1. Upload Spreadsheet File (.xlsx or .csv, Max 20MB) *
                                </label>
                                <div className="border-2 border-dashed border-border hover:border-brand-primary rounded-2xl p-6 text-center cursor-pointer transition-colors bg-surface-muted relative">
                                    <input
                                        type="file"
                                        accept=".xlsx, .csv, .xls"
                                        onChange={(e) => setExcelFile(e.target.files[0])}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <FiUploadCloud className="w-10 h-10 text-content-muted mx-auto mb-2" />
                                    <p className="text-sm font-medium text-content-secondary">
                                        {excelFile ? excelFile.name : 'Drag & drop file here or click to browse'}
                                    </p>
                                    <p className="text-xs text-content-muted mt-1">Supported: .xlsx, .csv up to 20MB</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-content-secondary mb-2">
                                    2. Upload Images Archive (Optional: images.zip matching SKU.jpg / SKU.png)
                                </label>
                                <div className="border border-dashed border-border hover:border-brand-primary rounded-xl p-4 text-center cursor-pointer transition-colors bg-surface-muted relative">
                                    <input
                                        type="file"
                                        accept=".zip"
                                        onChange={(e) => setZipFile(e.target.files[0])}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <p className="text-xs font-medium text-content-secondary">
                                        {zipFile ? zipFile.name : 'Select images.zip (Matching SKU.jpg / SKU.png)'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-border-light">
                                <button
                                    onClick={() => setStep(1)}
                                    className="px-5 py-2 text-content-secondary font-medium text-sm hover:bg-surface-muted rounded-xl">
                                    ← Back
                                </button>
                                <button
                                    onClick={handleValidateUpload}
                                    disabled={!excelFile || isValidating}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors">
                                    {isValidating ? (
                                        <>
                                            <FiRefreshCw className="w-4 h-4 animate-spin" />
                                            Running Dry-Run Validation...
                                        </>
                                    ) : (
                                        'Dry-Run Validate & Preview →'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Preview Table */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-4 gap-3 text-center text-xs font-bold">
                                <div className="p-3 bg-surface-muted border rounded-xl">
                                    <p className="text-content-muted">Total Rows</p>
                                    <p className="text-lg text-content">{previewRows.length}</p>
                                </div>
                                <div className="p-3 bg-status-successBg border border-status-success/20 rounded-xl">
                                    <p className="text-status-success">✓ Valid</p>
                                    <p className="text-lg text-status-success">
                                        {previewRows.filter((r) => r.validationStatus === 'valid').length}
                                    </p>
                                </div>
                                <div className="p-3 bg-status-warningBg border border-status-warning/20 rounded-xl">
                                    <p className="text-status-warning">⚠ Warnings</p>
                                    <p className="text-lg text-status-warning">
                                        {previewRows.filter((r) => r.validationStatus === 'warning').length}
                                    </p>
                                </div>
                                <div className="p-3 bg-status-errorBg border border-status-error/20 rounded-xl">
                                    <p className="text-status-error">✖ Errors</p>
                                    <p className="text-lg text-status-error">
                                        {previewRows.filter((r) => r.validationStatus === 'error').length}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-4 flex-wrap">
                                    <span className="flex items-center gap-1 font-semibold text-emerald-700">🟢 Valid: Ready to import</span>
                                    <span className="flex items-center gap-1 font-semibold text-amber-700">🟡 Warning: Import allowed (Hover for details)</span>
                                    <span className="flex items-center gap-1 font-semibold text-red-700">🔴 Error: Import blocked</span>
                                </div>
                                <span className="text-[11px] text-blue-700 font-medium italic">Hover over any status badge for instant details</span>
                            </div>

                            {/* Preview Table */}
                            <div className="border border-border rounded-xl overflow-x-auto max-h-[300px]">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-surface-muted text-content-secondary font-semibold sticky top-0">
                                        <tr>
                                            <th className="p-2.5">Row</th>
                                            <th className="p-2.5">Product Name</th>
                                            <th className="p-2.5">Category</th>
                                            <th className="p-2.5">SKU</th>
                                            <th className="p-2.5">Price</th>
                                            <th className="p-2.5">Stock</th>
                                            <th className="p-2.5">Status</th>
                                            <th className="p-2.5">Validation</th>
                                            <th className="p-2.5 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {previewRows.map((r) => (
                                            <tr
                                                key={r.rowNumber}
                                                className={`hover:bg-surface-muted ${
                                                    r.validationStatus === 'error'
                                                        ? 'bg-red-50/40'
                                                        : r.validationStatus === 'warning'
                                                        ? 'bg-amber-50/40'
                                                        : ''
                                                }`}>
                                                <td className="p-2.5 font-medium">{r.rowNumber}</td>
                                                <td className="p-2.5 font-semibold text-content">{r.name}</td>
                                                <td className="p-2.5">{r.categoryName}</td>
                                                <td className="p-2.5 font-mono text-[11px]">{r.sku}</td>
                                                <td className="p-2.5 font-medium">₹{r.price}</td>
                                                <td className="p-2.5">{r.stockQuantity}</td>
                                                <td className="p-2.5">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.isActive ? 'bg-status-successBg text-status-success' : 'bg-surface-muted text-content-muted'}`}>
                                                        {r.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="p-2.5 relative">
                                                    {r.validationStatus === 'valid' && (
                                                        <div className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                                                            <FiCheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                                            <span>Valid</span>
                                                        </div>
                                                    )}

                                                    {r.validationStatus === 'warning' && (
                                                        <div className="group relative inline-block">
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-bold text-[11px] cursor-pointer hover:bg-amber-100 transition-colors">
                                                                <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                                <span>Warning</span>
                                                                <span className="text-[9px] bg-amber-200 text-amber-800 px-1 rounded-full font-extrabold">{r.warnings.length}</span>
                                                            </div>
                                                            <div className="hidden group-hover:block absolute right-0 z-30 w-72 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl border border-slate-700 mt-1 animate-fadeIn">
                                                                <p className="font-bold text-amber-400 mb-1.5 flex items-center gap-1">
                                                                    <FiAlertTriangle /> Import Allowed (Minor Notice)
                                                                </p>
                                                                <ul className="list-disc list-inside space-y-1 text-[11px] text-gray-200">
                                                                    {r.warnings.map((w, idx) => (
                                                                        <li key={idx}>{w}</li>
                                                                    ))}
                                                                </ul>
                                                                <p className="mt-2 text-[10px] text-emerald-400 border-t border-slate-700 pt-1 font-semibold">
                                                                    ✓ This row can still be imported successfully.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {r.validationStatus === 'error' && (
                                                        <div className="group relative inline-block">
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-bold text-[11px] cursor-pointer hover:bg-red-100 transition-colors">
                                                                <FiXCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                                <span>Error</span>
                                                                <span className="text-[9px] bg-red-200 text-red-800 px-1 rounded-full font-extrabold">{r.errors.length}</span>
                                                            </div>
                                                            <div className="hidden group-hover:block absolute right-0 z-30 w-72 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl border border-slate-700 mt-1 animate-fadeIn">
                                                                <p className="font-bold text-red-400 mb-1.5 flex items-center gap-1">
                                                                    <FiXCircle /> Import Blocked
                                                                </p>
                                                                <ul className="list-disc list-inside space-y-1 text-[11px] text-gray-200">
                                                                    {r.errors.map((errText, idx) => (
                                                                        <li key={idx}>{errText}</li>
                                                                    ))}
                                                                </ul>
                                                                <p className="mt-2 text-[10px] text-amber-300 border-t border-slate-700 pt-1 font-medium">
                                                                    💡 Delete this row or fix the category/price to allow import.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-2.5 text-center">
                                                    <button
                                                        onClick={() => handleRemoveRow(r.rowNumber)}
                                                        className="p-1 text-status-error hover:bg-status-errorBg rounded transition-colors"
                                                        title="Remove Row">
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-border-light">
                                <button
                                    onClick={() => setStep(2)}
                                    className="px-5 py-2 text-content-secondary font-medium text-sm hover:bg-surface-muted rounded-xl">
                                    ← Back
                                </button>
                                <button
                                    onClick={() => setStep(4)}
                                    disabled={previewRows.length === 0}
                                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors">
                                    Next: Duplicate Strategy →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Duplicate Strategy */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <div className="bg-surface-muted border border-border rounded-xl p-4">
                                <h3 className="text-sm font-bold text-content mb-2">Duplicate SKU Handling Strategy</h3>
                                <p className="text-xs text-content-secondary mb-4">
                                    Select how the system should handle SKUs that already exist in your catalog:
                                </p>

                                <div className="space-y-3">
                                    <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-white transition-colors">
                                        <input
                                            type="radio"
                                            name="duplicateMode"
                                            value="skip"
                                            checked={duplicateMode === 'skip'}
                                            onChange={(e) => setDuplicateMode(e.target.value)}
                                            className="mt-1 text-primary-600 focus:ring-primary-500"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-content">Skip Existing (Recommended)</p>
                                            <p className="text-xs text-content-muted">Leave existing catalog products untouched and skip duplicate rows.</p>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-white transition-colors">
                                        <input
                                            type="radio"
                                            name="duplicateMode"
                                            value="update"
                                            checked={duplicateMode === 'update'}
                                            onChange={(e) => setDuplicateMode(e.target.value)}
                                            className="mt-1 text-primary-600 focus:ring-primary-500"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-content">Update Existing</p>
                                            <p className="text-xs text-content-muted">Overwrites price, stock, description, and status of existing catalog products.</p>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-white transition-colors">
                                        <input
                                            type="radio"
                                            name="duplicateMode"
                                            value="create"
                                            checked={duplicateMode === 'create'}
                                            onChange={(e) => setDuplicateMode(e.target.value)}
                                            className="mt-1 text-primary-600 focus:ring-primary-500"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-content">Create Duplicate (New SKU)</p>
                                            <p className="text-xs text-content-muted">Creates a new product with an automatically appended unique SKU suffix.</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-border-light">
                                <button
                                    onClick={() => setStep(3)}
                                    className="px-5 py-2 text-content-secondary font-medium text-sm hover:bg-surface-muted rounded-xl">
                                    ← Back to Preview
                                </button>
                                <button
                                    onClick={handleExecuteImport}
                                    className="px-6 py-2.5 bg-brand-primary text-black rounded-xl font-semibold text-sm hover:bg-brand-primaryHover shadow-md transition-all">
                                    Execute Bulk Import ({previewRows.length} Products)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: Progress & Final Summary */}
                    {step === 5 && (
                        <div className="space-y-6 text-center py-4">
                            {isProcessing && (
                                <div className="space-y-4">
                                    <FiRefreshCw className="w-12 h-12 text-primary-600 animate-spin mx-auto" />
                                    <h3 className="text-lg font-bold text-content">Importing Products in Background...</h3>
                                    <div className="max-w-md mx-auto bg-border rounded-full h-4 overflow-hidden border">
                                        <div
                                            className="bg-primary-600 h-full transition-all duration-300"
                                            style={{ width: `${jobProgress?.progressPercent || 0}%` }}
                                        />
                                    </div>
                                    <p className="text-sm font-semibold text-content-secondary">
                                        Importing {jobProgress?.processedRows || 0} / {jobProgress?.totalRows || previewRows.length} ({jobProgress?.progressPercent || 0}%)
                                    </p>
                                    <button
                                        onClick={handleCancelImport}
                                        className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold">
                                        Cancel Import
                                    </button>
                                </div>
                            )}

                            {!isProcessing && jobProgress && (
                                <div className="space-y-6">
                                    <div className="p-4 bg-status-successBg border border-status-success/20 rounded-2xl text-center">
                                        <FiCheckCircle className="w-12 h-12 text-status-success mx-auto mb-2" />
                                        <h3 className="text-xl font-bold text-status-success">Bulk Upload Complete</h3>
                                        <p className="text-xs text-status-success mt-1">Products have been processed and synced to store catalog.</p>
                                    </div>

                                    <div className="grid grid-cols-5 gap-3 text-center text-xs font-bold">
                                        <div className="p-3 bg-surface-muted border rounded-xl">
                                            <p className="text-content-muted">Total</p>
                                            <p className="text-base text-content">{jobProgress.totalRows}</p>
                                        </div>
                                        <div className="p-3 bg-status-successBg border border-status-success/20 rounded-xl">
                                            <p className="text-status-success">Imported</p>
                                            <p className="text-base text-status-success">{jobProgress.importedCount}</p>
                                        </div>
                                        <div className="p-3 bg-status-infoBg border border-status-info/20 rounded-xl">
                                            <p className="text-status-info">Updated</p>
                                            <p className="text-base text-status-info">{jobProgress.updatedCount}</p>
                                        </div>
                                        <div className="p-3 bg-status-warningBg border border-status-warning/20 rounded-xl">
                                            <p className="text-status-warning">Skipped</p>
                                            <p className="text-base text-status-warning">{jobProgress.skippedCount}</p>
                                        </div>
                                        <div className="p-3 bg-status-errorBg border border-status-error/20 rounded-xl">
                                            <p className="text-status-error">Failed</p>
                                            <p className="text-base text-status-error">{jobProgress.failedCount}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-center gap-4 pt-4 border-t border-border-light">
                                        {jobProgress.errorFileUrl && (
                                            <a
                                                href={jobProgress.errorFileUrl}
                                                download
                                                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-xs hover:bg-red-700 transition-colors">
                                                <FiDownload /> Download Import_Errors.xlsx
                                            </a>
                                        )}
                                        {jobProgress.validFileUrl && (
                                            <a
                                                href={jobProgress.validFileUrl}
                                                download
                                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-xs hover:bg-emerald-700 transition-colors">
                                                <FiDownload /> Download Valid_Rows.xlsx
                                            </a>
                                        )}
                                        <button
                                            onClick={onClose}
                                            className="px-6 py-2.5 bg-surface-header text-content-inverse rounded-xl font-semibold text-sm hover:bg-content transition-colors">
                                            Close
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkUploadModal;
