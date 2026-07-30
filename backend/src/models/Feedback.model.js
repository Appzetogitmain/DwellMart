import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        category: {
            type: String,
            required: true,
            enum: ['UI/UX', 'Bug', 'Suggestion', 'Other', 'General'],
            default: 'General',
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['new', 'reviewed', 'resolved'],
            default: 'new',
        },
    },
    { timestamps: true }
);

const Feedback = mongoose.model('Feedback', feedbackSchema);

export { Feedback };
export default Feedback;
