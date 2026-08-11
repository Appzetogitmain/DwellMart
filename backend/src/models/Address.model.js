import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true }, // label: Home, Work, etc.
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true },
        // Optional exact delivery pin. Existing/manual addresses remain valid.
        location: {
            type: { type: String, enum: ['Point'] },
            coordinates: { type: [Number], validate: (value) => !value || value.length === 2 },
        },
        isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
);

addressSchema.index({ location: '2dsphere' });

const Address = mongoose.model('Address', addressSchema);
export default Address;
