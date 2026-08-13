import mongoose from 'mongoose';

/**
 * One "helpful" vote per user per review.
 *
 * `voteHelpful` previously did an unbounded `$inc` on `Review.helpfulCount`
 * from an unauthenticated route, so the counter carried no meaning. Recording
 * votes individually makes the count reconstructable and the action idempotent.
 */
const reviewHelpfulVoteSchema = new mongoose.Schema(
    {
        reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    },
    { timestamps: true }
);

reviewHelpfulVoteSchema.index({ reviewId: 1, userId: 1 }, { unique: true });

const ReviewHelpfulVote = mongoose.model('ReviewHelpfulVote', reviewHelpfulVoteSchema);

export default ReviewHelpfulVote;
export { ReviewHelpfulVote };
