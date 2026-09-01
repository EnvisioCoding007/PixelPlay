import Review from '../../models/Review.js';
import User from '../../models/User.js';
import Product from '../../models/Product.js';
import { recalculateProductRating } from '../user/reviewService.js';

/**
 * Fetches paginated reviews for Admin with search, rating filter, flag filter, and sort options.
 */
export const getAllReviewsAdminPaginated = async (
    search = '',
    rating = 'All',
    flagStatus = 'All',
    sort = 'newest',
    page = 1,
    limit = 10
) => {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // Rating Filter
    if (rating && rating !== 'All') {
        filter.rating = Number(rating);
    }

    // Flag Status Filter
    if (flagStatus === 'flagged') {
        filter.is_flagged = true;
    } else if (flagStatus === 'clean') {
        filter.is_flagged = false;
    }

    // Search Keyword (in comment, product title, user email/username)
    if (search && search.trim()) {
        const searchStr = search.trim();
        const searchRegex = new RegExp(searchStr, 'i');

        const [matchingUsers, matchingProducts] = await Promise.all([
            User.find({
                $or: [
                    { username: searchRegex },
                    { email: searchRegex }
                ]
            }).select('_id'),
            Product.find({ title: searchRegex }).select('_id')
        ]);

        const userIds = matchingUsers.map(u => u._id);
        const productIds = matchingProducts.map(p => p._id);

        filter.$or = [
            { comment: searchRegex },
            { userId: { $in: userIds } },
            { productId: { $in: productIds } }
        ];
    }

    // Sort options
    let sortConfig = { createdAt: -1 };
    if (sort === 'oldest') {
        sortConfig = { createdAt: 1 };
    } else if (sort === 'rating_desc') {
        sortConfig = { rating: -1, createdAt: -1 };
    } else if (sort === 'rating_asc') {
        sortConfig = { rating: 1, createdAt: -1 };
    }

    const [reviews, totalCount] = await Promise.all([
        Review.find(filter)
            .sort(sortConfig)
            .skip(skip)
            .limit(limitNum)
            .populate('productId', 'title cover_image publisher category')
            .populate('userId', 'username email profile_image role')
            .lean(),
        Review.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        reviews,
        totalCount,
        totalPages,
        currentPage: pageNum
    };
};

/**
 * Computes summary statistics for Admin Review Management.
 */
export const getAdminReviewStats = async () => {
    const [totalReviews, flaggedCount, lowRatingCount, avgAgg] = await Promise.all([
        Review.countDocuments(),
        Review.countDocuments({ is_flagged: true }),
        Review.countDocuments({ rating: { $lte: 2 } }),
        Review.aggregate([
            { $group: { _id: null, avg: { $avg: '$rating' } } }
        ])
    ]);

    const platformAvgRating = avgAgg && avgAgg.length > 0 ? parseFloat(avgAgg[0].avg.toFixed(1)) : 0;

    return {
        totalReviews,
        flaggedCount,
        lowRatingCount,
        platformAvgRating
    };
};

/**
 * Admin action to flag or unflag a review for spam, fraud, or inappropriate content.
 */
export const toggleFlagReviewAdmin = async (reviewId, isFlagged, flagReason = null, flagNotes = '') => {
    const review = await Review.findById(reviewId);
    if (!review) {
        throw new Error('Review record not found.');
    }

    review.is_flagged = Boolean(isFlagged);
    if (review.is_flagged) {
        review.flag_reason = flagReason || 'Spam';
        review.flag_notes = (flagNotes || '').trim();
        review.flagged_at = new Date();
    } else {
        review.flag_reason = null;
        review.flag_notes = '';
        review.flagged_at = null;
    }

    await review.save();
    return review;
};

/**
 * Admin action to permanently delete a review and recalculate product aggregate rating.
 */
export const deleteReviewAdmin = async (reviewId) => {
    const review = await Review.findById(reviewId);
    if (!review) {
        throw new Error('Review record not found.');
    }

    const productId = review.productId;
    await Review.findByIdAndDelete(reviewId);

    // Recalculate product storefront rating
    await recalculateProductRating(productId);

    return { success: true };
};
