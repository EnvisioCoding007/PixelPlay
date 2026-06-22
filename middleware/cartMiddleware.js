import { getCartItemCount } from '../services/cartService.js';

export const injectCartCount = async (req, res, next) => {
    res.locals.cartCount = 0;
    if (req.session && req.session.user) {
        try {
            const userId = req.session.user.id || req.session.user;
            res.locals.cartCount = await getCartItemCount(userId);
        } catch (err) {
            console.error('Error fetching cart count:', err);
        }
    }
    next();
};
