import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    is_verified: {
        type: Boolean,
        default: true
    },
    is_flagged: {
        type: Boolean,
        default: false,
        index: true
    },
    flag_reason: {
        type: String,
        enum: ['Spam', 'Fraud / Fake Review', 'Inappropriate Content', 'Abusive Language', 'Other', null],
        default: null
    },
    flag_notes: {
        type: String,
        trim: true,
        default: ''
    },
    flagged_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Ensure a user can only leave one review per product (they can edit/update it)
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
