import mongoose from 'mongoose';
import { EXPERIENCES, EXPERIENCE_VALUES } from '../constants/experiences.js';

const categorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, index: true },
        description: { type: String, trim: true, default: '' },
        image: { type: String, default: '' },
        icon: { type: String, default: '' },
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
        order: { type: Number, default: 0 },
        displayOrder: { type: Number, default: 0, index: true },
        isActive: { type: Boolean, default: true, index: true },
        // Array of shopping experiences where this category is active.
        // Replaces single experience field for ambiguity-free multi-channel support.
        supportedExperiences: {
            type: [{ type: String, enum: EXPERIENCE_VALUES }],
            default: [EXPERIENCES.MARKETPLACE],
            index: true,
        },
    },
    { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtual getter for backward compatibility with code expecting category.experience
categorySchema.virtual('experience').get(function () {
    return Array.isArray(this.supportedExperiences) && this.supportedExperiences.length > 0
        ? this.supportedExperiences[0]
        : EXPERIENCES.MARKETPLACE;
});

categorySchema.index({ parentId: 1, displayOrder: 1, name: 1 });
categorySchema.index({ isActive: 1, displayOrder: 1, name: 1 });
categorySchema.index({ supportedExperiences: 1, isActive: 1, displayOrder: 1 });

const Category = mongoose.model('Category', categorySchema);
export { Category };
export default Category;

