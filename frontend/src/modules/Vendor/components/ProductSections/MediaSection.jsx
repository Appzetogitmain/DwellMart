/**
 * MediaSection — main product image + gallery
 */
import { FiUpload, FiX } from "react-icons/fi";

const MediaSection = ({
  formData,
  setFormData,
  handleImageUpload,
  handleGalleryUpload,
  removeGalleryImage,
  isUploadingMedia,
}) => (
  <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-3 sm:p-4 border-2 border-primary-200 shadow-lg">
    <h2 className="text-base font-bold text-primary-800 mb-3 flex items-center gap-2">
      <FiUpload className="text-lg" />
      Product Media
    </h2>

    <div className="space-y-3">
      {/* Main Image */}
      <div className="bg-white rounded-lg p-3 border border-primary-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Main Image</h3>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Upload Main Image
          </label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="main-image-upload"
              disabled={isUploadingMedia}
            />
            <label
              htmlFor="main-image-upload"
              className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-primary-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors bg-white"
            >
              <FiUpload className="text-base text-primary-600" />
              <span className="text-xs font-medium text-gray-700">
                {formData.image ? "Change Main Image" : "Choose Main Image"}
              </span>
            </label>
          </div>
          {formData.image && (
            <div className="mt-2 flex items-start gap-3">
              <img
                src={formData.image}
                alt="Main Preview"
                className="w-24 h-24 object-cover rounded-lg border-2 border-primary-300 shadow-md"
                onError={(e) => { e.target.style.display = "none"; }}
              />
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                className="mt-1 px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium"
              >
                Remove Image
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className="bg-white rounded-lg p-3 border border-primary-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Product Gallery</h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
            {formData.images?.length || 0}/3 images
          </span>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Upload Gallery Images (Max 3, Total 4 including Main Image)
          </label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryUpload}
              className="hidden"
              id="gallery-upload"
              disabled={isUploadingMedia || (formData.images || []).length >= 3}
            />
            <label
              htmlFor={(formData.images || []).length >= 3 ? undefined : "gallery-upload"}
              className={`flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed rounded-lg transition-colors bg-white ${
                (formData.images || []).length >= 3
                  ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                  : "border-primary-300 cursor-pointer hover:border-primary-500 hover:bg-primary-50"
              }`}
            >
              <FiUpload className={`text-base ${(formData.images || []).length >= 3 ? "text-gray-400" : "text-primary-600"}`} />
              <span className="text-xs font-medium text-gray-700">
                {(formData.images || []).length >= 3
                  ? "Gallery Limit Reached (3/3) - Remove an image to change"
                  : "Choose Gallery Images (Max 3)"}
              </span>
            </label>
          </div>
          {formData.images?.length > 0 && (
            <div className="mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {formData.images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img}
                      alt={`Gallery ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border-2 border-primary-300 shadow-md"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="Remove image"
                    >
                      <FiX className="text-xs" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {formData.images.length} image(s) in gallery
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);

export default MediaSection;
