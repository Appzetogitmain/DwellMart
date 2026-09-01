import React, { useState, useRef } from 'react';
import { FiUploadCloud, FiDownload, FiCheckCircle, FiAlertCircle, FiX, FiFileText } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { downloadBrandTemplateApi, importBrandsApi } from '../../services/adminService';
import toast from 'react-hot-toast';

const BrandImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      const response = await downloadBrandTemplateApi();
      const blob = response instanceof Blob
        ? response
        : new Blob([response?.data || response], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'brand_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Sample brand template downloaded');
    } catch (err) {
      toast.error('Failed to download template. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = selectedFile.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV (.csv) file');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds the 10MB limit');
      return;
    }

    setFile(selectedFile);
    setImportResult(null);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file to import');
      return;
    }

    setIsUploading(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await importBrandsApi(formData);
      const data = response?.data?.data || response?.data || {};
      setImportResult(data);
      toast.success(`Brands imported: ${data.createdCount || 0} created, ${data.updatedCount || 0} updated`);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to import brands';
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <FiUploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Bulk Import Brands</h3>
              <p className="text-xs text-slate-500">Upload Excel or CSV file to create or update brands in bulk</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Download Sample Template Banner */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800">Need the formatted spreadsheet?</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Download the pre-formatted Excel template with sample brand records.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={isDownloading}
              className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
            >
              <FiDownload className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'Downloading...' : 'Download Template'}</span>
            </button>
          </div>

          {/* File Upload Dropzone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Upload Spreadsheet</label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-primary-500 bg-primary-50/50'
                  : file
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <FiFileText className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors ml-2"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-2">
                    <FiUploadCloud className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    Click to browse <span className="font-normal text-slate-500">or drag and drop</span>
                  </p>
                  <p className="text-xs text-slate-400">Supports .xlsx, .xls, and .csv (Max: 10MB)</p>
                </div>
              )}
            </div>
          </div>

          {/* Import Results Card */}
          {importResult && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <FiCheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                <h4 className="text-sm font-bold">Import Summary</h4>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-emerald-100">
                  <span className="block text-slate-400 font-medium">Total Rows</span>
                  <span className="text-base font-bold text-slate-800">{importResult.totalRows ?? 0}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-emerald-100">
                  <span className="block text-slate-400 font-medium">Created</span>
                  <span className="text-base font-bold text-emerald-600">+{importResult.createdCount ?? 0}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-emerald-100">
                  <span className="block text-slate-400 font-medium">Updated</span>
                  <span className="text-base font-bold text-blue-600">{importResult.updatedCount ?? 0}</span>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-emerald-200/60">
                  <p className="text-xs font-bold text-rose-700 flex items-center gap-1 mb-1.5">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    Row Errors ({importResult.errors.length}):
                  </p>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-xs text-rose-600 bg-rose-50/60 p-2 rounded-lg border border-rose-100">
                    {importResult.errors.map((err, idx) => (
                      <p key={idx} className="font-mono text-[11px]">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            {importResult ? 'Close' : 'Cancel'}
          </button>
          {!importResult && (
            <button
              type="button"
              onClick={handleImportSubmit}
              disabled={!file || isUploading}
              className={`px-5 py-2 text-sm font-bold rounded-xl text-white shadow-sm transition-all flex items-center gap-2 ${
                !file || isUploading
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 shadow-primary-500/20 active:scale-[0.98]'
              }`}
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <FiUploadCloud className="w-4 h-4" />
                  <span>Upload & Import</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default BrandImportModal;
