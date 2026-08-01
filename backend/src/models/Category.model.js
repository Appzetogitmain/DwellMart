import mongoose from 'mongoose';
import { EXPERIENCES, EXPERIENCE_VALUES } from '../constants/experiences.js';

const categorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        // Slug uniqueness is scoped per experience (see compound index below), so
        // Marketplace and Quick Commerce may each own e.g. "beverages".
        slug: { type: String, required: true },
        description: { type: String, trim: true, default: '' },
        image: { type: String },
        icon: { type: String },
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        // Which shopping experience this category tree belongs to. Existing
        // categories default to marketplace, so the current tree is untouched.
        experience: {
            type: String,
            enum: EXPERIENCE_VALUES,
            default: EXPERIENCES.MARKETPLACE,
            index: true,
        },
    },
    { timestamps: true }
);

categorySchema.index({ parentId: 1, order: 1 });
categorySchema.index({ isActive: 1, order: 1, name: 1 });
categorySchema.index({ experience: 1, parentId: 1, isActive: 1 });
categorySchema.index({ experience: 1, slug: 1 }, { unique: true });

const Category = mongoose.model('Category', categorySchema);
export { Category };
export default Category;
