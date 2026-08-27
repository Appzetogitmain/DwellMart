import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FiX, FiSave, FiUpload, FiTrash2 } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import AnimatedSelect from "../AnimatedSelect";
import toast from "react-hot-toast";
import Button from "../Button";
import { uploadAdminImage } from "../../services/adminService";
import { getImageUrl } from "../../../../shared/utils/helpers";

const CategoryForm = ({ category, parentId, experience, onClose, onSave }) => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { categories, createCategory, updateCategory, getCategoryById } =
    useCategoryStore();
  const isEdit = !!category;
  const isSubcategory = !isEdit && parentId !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);

  const parentCategory = parentId
    ? getCategoryById(parentId)
    : category?.parentId
    ? getCategoryById(category.parentId)
    : null;

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    image: "",
    parentId: null,
    isActive: true,
    order: 0,
    displayOrder: 0,
    supportedExperiences: ["marketplace"],
  });

  const sanitizeExperiences = (experiences, fallback = "marketplace") => {
    const validSet = new Set(["marketplace", "quick_commerce", "wholesale"]);
    if (!Array.isArray(experiences)) {
      return [fallback];
    }
    const filtered = experiences.filter((e) => typeof e === "string" && validSet.has(e.trim().toLowerCase()));
    return filtered.length > 0 ? [...new Set(filtered)] : [fallback];
  };

  // Revoke object URL on unmount or when replaced to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }

    if (category) {
      setFormData({
        name: category.name || "",
        description: category.description || "",
        image: category.image || "",
        parentId: category.parentId || null,
        isActive: category.isActive !== undefined ? category.isActive : true,
        order: category.displayOrder || category.order || 0,
        displayOrder: category.displayOrder || category.order || 0,
        supportedExperiences: sanitizeExperiences(
          category.supportedExperiences || [category.experience],
          "marketplace"
        ),
      });
    } else {
      setFormData({
        name: "",
        description: "",
        image: "",
        parentId: parentId || null,
        isActive: true,
        order: 0,
        displayOrder: 0,
        supportedExperiences: sanitizeExperiences(experience ? [experience] : ["marketplace"]),
      });
    }
  }, [category, parentId, experience]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : (name === "parentId" && value === "") ? null : value,
    });
  };

  const handleExperienceToggle = (exp) => {
    setFormData((prev) => {
      const current = sanitizeExperiences(prev.supportedExperiences, "marketplace");
      const updated = current.includes(exp)
        ? current.filter((item) => item !== exp)
        : [...current, exp];
      return {
        ...prev,
        supportedExperiences: sanitizeExperiences(updated, "marketplace"),
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error("Category name is required");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const payload = {
      ...formData,
      name: formData.name.trim(),
      description: formData.description || "",
      image: formData.image || "",
      parentId: formData.parentId || null,
      supportedExperiences: sanitizeExperiences(formData.supportedExperiences, "marketplace"),
    };

    try {
      if (isEdit) {
        // Experience is immutable after creation — the server ignores it too.
        await updateCategory(category.id, payload);
      } else {
        // New categories are created in whichever tree the admin is managing.
        await createCategory({ ...payload, ...(experience ? { experience } : {}) });
      }
      onSave?.();
      onClose();
    } catch (error) {
      // Error handled in store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. File size validation (5MB max)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image size exceeds the maximum allowed size (5MB).");
      e.target.value = "";
      return;
    }

    // 2. Format validation (MIME or extension check)
    const allowedMimes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/pjpeg",
      "image/x-png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "image/avif",
    ];
    const allowedExtRegex = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
    const isMimeValid = file.type && allowedMimes.includes(file.type.toLowerCase().trim());
    const isExtValid = allowedExtRegex.test(file.name || "");

    if (!isMimeValid && !isExtValid) {
      toast.error("Unsupported image format. Please upload PNG, JPG, JPEG, WEBP, or GIF.");
      e.target.value = "";
      return;
    }

    // 3. Immediate 0ms local preview
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    const newPreview = URL.createObjectURL(file);
    setLocalPreviewUrl(newPreview);

    // 4. Upload to Cloudinary / server
    setIsUploadingImage(true);
    try {
      const response = await uploadAdminImage(file, "categories");
      const imageUrl = response?.data?.url || response?.url;
      if (!imageUrl) {
        throw new Error("Invalid response from image upload server");
      }
      setFormData((prev) => ({ ...prev, image: imageUrl }));
      toast.success("Category image uploaded successfully");
    } catch (error) {
      console.error("Image upload failed:", error);
      // Revert preview on failure
      setLocalPreviewUrl(null);
      URL.revokeObjectURL(newPreview);
      toast.error(error?.response?.data?.message || "Failed to upload image. Please try again.");
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const currentPreviewSrc = localPreviewUrl || (formData.image ? getImageUrl(formData.image) : null);

  // Get available parent categories (exclude current category and its children)
  const getAvailableParents = () => {
    if (!isEdit) return categories.filter((cat) => cat.isActive);

    const descendants = new Set();
    const queue = [String(category.id)];
    while (queue.length > 0) {
      const currentId = queue.shift();
      categories.forEach((cat) => {
        const parent = typeof cat.parentId === "object"
          ? (cat.parentId?._id ?? cat.parentId?.id ?? null)
          : cat.parentId;
        if (parent && String(parent) === String(currentId) && !descendants.has(String(cat.id))) {
          descendants.add(String(cat.id));
          queue.push(String(cat.id));
        }
      });
    }

    return categories.filter(
      (cat) =>
        cat.isActive &&
        String(cat.id) !== String(category.id) &&
        !descendants.has(String(cat.id))
    );
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[10000]"
        />

        {/* Modal Content - Mobile: Slide up from bottom, Desktop: Center with scale */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[10000] flex ${
            isAppRoute ? "items-start pt-[10px]" : "items-end"
          } sm:items-center justify-center p-4 pointer-events-none`}>
          <motion.div
            variants={{
              hidden: {
                y: isAppRoute ? "-100%" : "100%",
                scale: 0.95,
                opacity: 0,
              },
              visible: {
                y: 0,
                scale: 1,
                opacity: 1,
                transition: {
                  type: "spring",
                  damping: 22,
                  stiffness: 350,
                  mass: 0.7,
                },
              },
              exit: {
                y: isAppRoute ? "-100%" : "100%",
                scale: 0.95,
                opacity: 0,
                transition: {
                  type: "spring",
                  damping: 30,
                  stiffness: 400,
                },
              },
            }}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={`bg-white ${
              isAppRoute ? "rounded-b-3xl" : "rounded-t-3xl"
            } sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-admin pointer-events-auto`}
            style={{ willChange: "transform" }}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800">
                  {isEdit
                    ? "Edit Category"
                    : isSubcategory
                    ? "Create Subcategory"
                    : "Create Category"}
                </h2>
                {isSubcategory && parentCategory && (
                  <p className="text-sm text-gray-600 mt-1">
                    Parent:{" "}
                    <span className="font-semibold text-gray-800">
                      {parentCategory.name}
                    </span>
                  </p>
                )}
                {isEdit && parentCategory && (
                  <p className="text-sm text-gray-600 mt-1">
                    Parent:{" "}
                    <span className="font-semibold text-gray-800">
                      {parentCategory.name}
                    </span>
                  </p>
                )}
              </div>
              <Button
                onClick={onClose}
                variant="icon"
                icon={FiX}
                className="text-gray-600"
              />
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Basic Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Category Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="e.g., Clothing, Electronics"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Category description..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Parent Category
                    </label>
                    {isSubcategory ? (
                      <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700 font-medium">
                            {parentCategory ? parentCategory.name : "None"}
                          </span>
                          {isSubcategory && (
                            <span className="text-xs text-gray-500">
                              (Cannot be changed)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <AnimatedSelect
                        name="parentId"
                        value={formData.parentId || ""}
                        onChange={handleChange}
                        placeholder="None (Root Category)"
                        options={[
                          { value: "", label: "None (Root Category)" },
                          ...getAvailableParents().map((cat) => ({
                            value: String(cat.id),
                            label: cat.name,
                          })),
                        ]}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Image */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Category Image
                </h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Upload Image
                  </label>
                  <div className="mt-1 flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-semibold">
                      <FiUpload />
                      {isUploadingImage
                        ? "Uploading..."
                        : currentPreviewSrc
                        ? "Replace Image"
                        : "Upload Image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={isUploadingImage}
                      />
                    </label>
                  </div>
                  {currentPreviewSrc && (
                    <div className="mt-4 flex items-start gap-4">
                      <div className="w-32 h-32 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden relative shadow-xs">
                        <img
                          src={currentPreviewSrc}
                          alt="Category Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            if (e.currentTarget.nextElementSibling) {
                              e.currentTarget.nextElementSibling.style.display = "flex";
                            }
                          }}
                        />
                        <div
                          className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-xs text-gray-400"
                          style={{ display: "none" }}
                        >
                          <span className="text-2xl mb-1">🖼️</span>
                          <span>Image load failed</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        <p className="text-xs font-semibold text-gray-700">Preview</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (localPreviewUrl) {
                              URL.revokeObjectURL(localPreviewUrl);
                              setLocalPreviewUrl(null);
                            }
                            setFormData((prev) => ({ ...prev, image: "" }));
                          }}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold hover:underline cursor-pointer"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                          Remove Image
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Supported Experiences */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">
                  Supported Experiences <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Select which shopping experiences this category should appear in.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: "quick_commerce", label: "⚡ Quick Commerce (Express)" },
                    { key: "marketplace", label: "📦 Marketplace (B2C)" },
                    { key: "wholesale", label: "🏬 Wholesale (B2B)" },
                  ].map((exp) => {
                    const isChecked = (formData.supportedExperiences || []).includes(exp.key);
                    return (
                      <label
                        key={exp.key}
                        className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked
                            ? "border-primary-500 bg-primary-50/50 shadow-xs"
                            : "border-gray-200 hover:border-gray-300 bg-gray-50/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleExperienceToggle(exp.key)}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-800 select-none">{exp.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Settings
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Display Order
                    </label>
                    <input
                      type="number"
                      name="displayOrder"
                      value={formData.displayOrder}
                      onChange={(e) => setFormData({ ...formData, displayOrder: Number(e.target.value) || 0, order: Number(e.target.value) || 0 })}
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0 (Lower numbers appear first)"
                    />
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={formData.isActive}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      Active
                    </span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                <Button type="button" onClick={onClose} variant="secondary">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={FiSave}
                  disabled={isSubmitting || isUploadingImage}>
                  {isEdit ? "Update Category" : "Create Category"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default CategoryForm;
