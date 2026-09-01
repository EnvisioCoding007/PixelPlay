import * as reviewService from '../../services/admin/reviewService.js';

export const renderReviewManagement = async (req, res) => {
    try {
        const {
            search = '',
            rating = 'All',
            flagStatus = 'All',
            sort = 'newest',
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        const [stats, reviewData] = await Promise.all([
            reviewService.getAdminReviewStats(),
            reviewService.getAllReviewsAdminPaginated(search, rating, flagStatus, sort, pageNum, limitNum)
        ]);

        res.render('admin/reviews', {
            activeTab: 'reviews',
            stats,
            reviews: reviewData.reviews,
            currentPage: reviewData.currentPage,
            totalPages: reviewData.totalPages,
            totalCount: reviewData.totalCount,
            filters: {
                search,
                rating,
                flagStatus,
                sort,
                page: pageNum,
                limit: limitNum
            },
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderReviewManagement Error]', err);
        res.status(500).send('Internal Server Error loading Review Management.');
    }
};

export const toggleFlagReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { isFlagged, flagReason, flagNotes } = req.body;

        const updatedReview = await reviewService.toggleFlagReviewAdmin(id, isFlagged, flagReason, flagNotes);

        return res.status(200).json({
            success: true,
            message: updatedReview.is_flagged 
                ? `Review flagged as "${updatedReview.flag_reason}".`
                : 'Review flag removed successfully.',
            review: updatedReview
        });
    } catch (err) {
        console.error('[toggleFlagReview Error]', err);
        return res.status(400).json({ success: false, message: err.message || 'Failed to update review flag status.' });
    }
};

export const deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        await reviewService.deleteReviewAdmin(id);

        return res.status(200).json({
            success: true,
            message: 'Review deleted successfully.'
        });
    } catch (err) {
        console.error('[deleteReview Admin Error]', err);
        return res.status(400).json({ success: false, message: err.message || 'Failed to delete review.' });
    }
};
