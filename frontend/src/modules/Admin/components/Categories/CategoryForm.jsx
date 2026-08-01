import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FiX, FiSave, FiUpload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import AnimatedSelect from "../AnimatedSelect";
import toast from "react-hot-toast";
import Button from "../Button";
import { uploadAdminImage } from "../../services/adminService";

const CategoryForm = ({ category, parentId, experience, onClose, onSave }) => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { categories, createCategory, updateCategory, getCategoryById } =
    useCategoryStore();
  const isEdit = !!category;
  const isSubcategory = !isEdit && parentId !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
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

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || "",
        description: category.description || "",
        image: category.image || "",
        parentId: category.parentId || null,
        isActive: category.isActive !== undefined ? category.isActive : true,
        order: category.displayOrder || category.order || 0,
        displayOrder: category.displayOrder || category.order || 0,
        supportedExperiences: Array.isArray(category.supportedExperiences) && category.supportedExperiences.length > 0
          ? category.supportedExperiences
          : [category.experience || "marketplace"],
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
        supportedExperiences: experience ? [experience] : ["marketplace"],
      });
    }
  }, [category, parentId, experience]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value === "" ? null : value,
    });
  };

  const handleExperienceToggle = (exp) => {
    setFormData((prev) => {
      const current = prev.supportedExperiences || [];
      const updated = current.includes(exp)
        ? current.filter((item) => item !== exp)
        : [...current, exp];
      return {
        ...prev,
        supportedExperiences: updated.length > 0 ? updated : ["marketplace"],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Category name is required");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (isEdit) {
        // Experience is immutable after creation — the server ignores it too.
        await updateCategory(category.id, formData);
      } else {
        // New categories are created in whichever tree the admin is managing.
        await createCategory({ ...formData, ...(experience ? { experience } : {}) });
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

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await uploadAdminImage(file, "categories");
      const imageUrl = response?.data?.url;
      if (!imageUrl) {
        toast.error("Image upload failed");
        return;
      }
      setFormData((prev) => ({ ...prev, image: imageUrl }));
      toast.success("Category image uploaded");
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

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
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-semibold">
                      <FiUpload />
                      {isUploadingImage
                        ? "Uploading..."
                        : formData.image
                        ? "Replace Image"
                        : "Upload to Cloudinary"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={isUploadingImage}
                      />
                    </label>
                  </div>
                  {formData.image && (
                    <div className="mt-4">
                      <img
                        src={formData.image}
                        alt="Preview"
                        className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
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
