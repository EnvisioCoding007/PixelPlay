import * as reviewService from '../../services/user/reviewService.js';

const getUserIdFromSession = (sessionUser) => {
    if (!sessionUser) return null;
    if (typeof sessionUser === 'string') return sessionUser;
    if (sessionUser._id) return sessionUser._id.toString();
    if (sessionUser.id) return sessionUser.id.toString();
    return sessionUser.toString();
};

export const postReview = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const { rating, comment } = req.body;

        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: 'You must be signed in to submit a review.' });
        }

        const userId = getUserIdFromSession(req.session.user);
        const review = await reviewService.addOrUpdateReview(userId, productId, rating, comment);

        return res.status(200).json({
            success: true,
            message: 'Your review has been published successfully.',
            review
        });
    } catch (err) {
        console.error('[postReview Error]', err);
        return res.status(400).json({
            success: false,
            message: err.message || 'Failed to submit review.'
        });
    }
};

export const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;

        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        const userId = getUserIdFromSession(req.session.user);
        await reviewService.deleteReview(userId, reviewId);

        return res.status(200).json({
            success: true,
            message: 'Your review has been removed.'
        });
    } catch (err) {
        console.error('[deleteReview Error]', err);
        return res.status(400).json({
            success: false,
            message: err.message || 'Failed to delete review.'
        });
    }
};

export const checkEligibility = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const userId = getUserIdFromSession(req.session ? req.session.user : null);

        if (!userId) {
            return res.json({
                success: true,
                isEligible: false,
                existingReview: null,
                reason: 'Please sign in to check review eligibility.'
            });
        }

        const result = await reviewService.checkReviewEligibility(userId, productId);
        return res.json({
            success: true,
            ...result
        });
    } catch (err) {
        console.error('[checkEligibility Error]', err);
        return res.status(500).json({ success: false, message: 'Error checking eligibility.' });
    }
};
