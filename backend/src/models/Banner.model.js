import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
    {
        title: String,
        subtitle: String,
        description: String,
        image: { type: String, required: true },
        link: String,
        type: {
            type: String,
            enum: ['home_slider', 'quick_commerce', 'festival_offer', 'banner', 'hero', 'promotional', 'side_banner'],
            default: 'banner',
        },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        startDate: Date,
        endDate: Date,
    },
    { timestamps: true }
);

bannerSchema.index({ isActive: 1, type: 1, order: 1 });
bannerSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Banner = mongoose.model('Banner', bannerSchema);
export { Banner };
export default Banner;
