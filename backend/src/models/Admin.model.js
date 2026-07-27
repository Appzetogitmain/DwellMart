import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, select: false },
        phone: { type: String, trim: true, default: '' },
        role: { type: String, enum: ['superadmin', 'subadmin'], default: 'subadmin' },
        permissions: { type: [String], default: [] },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' },
        avatar: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        lastLoginAt: { type: Date },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
    },
    { timestamps: true }
);

adminSchema.pre('save', async function (next) {
    // Keep isActive synchronized with status
    if (this.isModified('status')) {
        this.isActive = this.status === 'active';
    }
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);
export { Admin };
export default Admin;
