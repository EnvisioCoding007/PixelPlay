import * as cartService from '../../services/cartService.js';
import * as userService from '../../services/userService.js';

export const getCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const {
            cart,
            subtotal,
            tax,
            shipping,
            grandTotal,
            hasUnavailableProduct
        } = await cartService.getCartDetails(userId);

        res.render('user/cart', {
            user,
            cart,
            subtotal,
            tax,
            shipping,
            grandTotal,
            hasUnavailableProduct
        });
    } catch (error) {
        console.error('[getCart] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading your cart.'
        });
    }
};

export const getCheckout = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const cartDetails = await cartService.getCartDetails(userId);

        if (!cartDetails.cart || !cartDetails.cart.items || cartDetails.cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        if (cartDetails.hasUnavailableProduct || cartDetails.hasInsufficientStockProduct) {
            return res.redirect('/user/cart');
        }

        res.render('user/checkout', {
            user,
            cart: {
                items: cartDetails.cart.items,
                subtotal: cartDetails.subtotal,
                tax: cartDetails.tax,
                shipping: cartDetails.shipping,
                discount: cartDetails.discount,
                grandTotal: cartDetails.grandTotal
            }
        });
    } catch (error) {
        console.error('[getCheckout] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading checkout.'
        });
    }
};

export const addToCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform, quantity } = req.body;
        if (!productId || !platform) {
            return res.status(400).json({ success: false, message: 'Product ID and Platform are required.' });
        }

        const result = await cartService.addToCart(userId, productId, platform, quantity);
        res.status(200).json({ success: true, cartCount: result.cartCount });
    } catch (error) {
        console.error('[addToCart] Error:', error);
        if (error.redirectUrl) {
            return res.status(400).json({ success: false, redirectUrl: error.redirectUrl, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateCartQuantity = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform, action } = req.body;
        if (!productId || !platform || !action) {
            return res.status(400).json({ success: false, message: 'Product ID, Platform, and Action are required.' });
        }

        const result = await cartService.updateCartQuantity(userId, productId, platform, action);
        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[updateCartQuantity] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform } = req.body;
        if (!productId || !platform) {
            return res.status(400).json({ success: false, message: 'Product ID and Platform are required.' });
        }

        const result = await cartService.removeFromCart(userId, productId, platform);
        return res.status(200).json({ success: true, cartCount: result.cartCount });
    } catch (error) {
        console.error('[removeFromCart] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};
