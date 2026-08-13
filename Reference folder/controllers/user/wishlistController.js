import * as wishlistService from '../../services/wishlistService.js';
import * as userService from '../../services/userService.js';

export const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const wishlist = await wishlistService.getWishlistByUserId(userId);

        res.render('user/wishlist', {
            user,
            wishlist
        });
    } catch (error) {
        console.error('[getWishlist] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading wishlist.'
        });
    }
};

export const toggleWishlist = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required.' });
        }

        const result = await wishlistService.toggleWishlist(userId, productId, platform);
        res.status(200).json({ success: true, added: result.added });
    } catch (error) {
        console.error('[toggleWishlist] Error:', error);
        if (error.redirectUrl) {
            return res.status(400).json({ success: false, redirectUrl: error.redirectUrl, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
