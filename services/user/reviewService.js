import Review from '../../models/Review.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';

/**
 * Checks if a user is eligible to rate/review a product.
 * Eligible status: Order status or item status is in ['Delivered', 'Returned', 'Return Requested'] and item is not Cancelled.
 */
export const checkReviewEligibility = async (userIdInput, productIdInput) => {
    if (!userIdInput || !productIdInput) {
        return { isEligible: false, existingReview: null, reason: 'Invalid parameters.' };
    }

    const userId = typeof userIdInput === 'object' ? (userIdInput._id ? userIdInput._id.toString() : userIdInput.toString()) : userIdInput.toString();
    const productId = typeof productIdInput === 'object' ? (productIdInput._id ? productIdInput._id.toString() : productIdInput.toString()) : productIdInput.toString();

    const existingReview = await Review.findOne({ userId, productId }).lean();

    const orders = await Order.find({
        userId,
        $or: [
            { orderStatus: { $in: ['Delivered', 'Returned', 'Return Requested'] } },
            { 'items.status': { $in: ['Delivered', 'Returned', 'Return Requested'] } }
        ]
    }).lean();

    let isEligible = false;
    for (const order of orders) {
        const item = order.items.find(i => {
            const itemProdId = i.product ? (i.product._id ? i.product._id.toString() : i.product.toString()) : null;
            return itemProdId === productId.toString() && i.status !== 'Cancelled';
        });

        if (item) {
            isEligible = true;
            break;
        }
    }

    return {
        isEligible,
        existingReview: existingReview || null,
        reason: isEligible 
            ? 'Verified buyer eligible for review' 
            : 'Only verified buyers who have received this product can rate and review.'
    };
};

/**
 * Recalculates average rating and review count for a product and updates the Product model.
 */
export const recalculateProductRating = async (productId) => {
    const stats = await Review.aggregate([
        { $match: { productId: new (Review.base.Types.ObjectId)(productId.toString()) } },
        {
            $group: {
                _id: '$productId',
                avgRating: { $avg: '$rating' },
                reviewCount: { $sum: 1 }
            }
        }
    ]);

    let avgRating = 0;
    let reviewCount = 0;

    if (stats && stats.length > 0) {
        avgRating = parseFloat(stats[0].avgRating.toFixed(1));
        reviewCount = stats[0].reviewCount;
    }

    await Product.findByIdAndUpdate(productId, {
        avgRating,
        reviewCount
    });

    return { avgRating, reviewCount };
};

/**
 * Adds or updates a review for a product by a verified buyer.
 */
export const addOrUpdateReview = async (userId, productId, rating, comment) => {
    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
        throw new Error('Rating must be between 1 and 5 stars.');
    }

    if (!comment || !comment.trim()) {
        throw new Error('Review comment is required.');
    }

    const { isEligible, reason } = await checkReviewEligibility(userId, productId);
    if (!isEligible) {
        throw new Error(reason || 'You are not eligible to rate or review this product.');
    }

    const review = await Review.findOneAndUpdate(
        { productId, userId },
        {
            rating: numericRating,
            comment: comment.trim(),
            is_verified: true
        },
        { upsert: true, new: true, runValidators: true }
    );

    await recalculateProductRating(productId);

    return review;
};

/**
 * Deletes a review created by a user and updates product rating.
 */
export const deleteReview = async (userId, reviewId) => {
    const review = await Review.findOne({ _id: reviewId, userId });
    if (!review) {
        throw new Error('Review not found or unauthorized to delete.');
    }

    const productId = review.productId;
    await Review.findByIdAndDelete(reviewId);
    await recalculateProductRating(productId);

    return { success: true };
};

/**
 * Gets all reviews for a product with populated user details.
 */
export const getReviewsForProduct = async (productId) => {
    const reviews = await Review.find({ productId })
        .sort({ createdAt: -1 })
        .populate('userId', 'username profile_image email')
        .lean();

    return reviews.map(r => ({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        is_verified: r.is_verified,
        createdAt: r.createdAt,
        username: r.userId ? (r.userId.username || r.userId.email.split('@')[0]) : 'Verified Customer',
        user_avatar: r.userId ? (r.userId.profile_image || null) : null
    }));
};
