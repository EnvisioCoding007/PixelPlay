import * as cartService from '../../services/user/cartService.js';
import * as userService from '../../services/user/userService.js';
import * as couponService from '../../services/user/couponService.js';
import { getWalletBalance } from '../../services/shared/walletHelper.js';

export const getCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/login');

        const {
            cart,
            subtotal,
            tax,
            gst_rate,
            shipping,
            grandTotal,
            hasUnavailableProduct,
            hasInsufficientStockProduct
        } = await cartService.getCartDetails(userId);

        // Reset coupon removal flag when viewing cart so proceeding to checkout auto-applies best coupon
        delete req.session.couponRemoved;

        res.render('user/cart', {
            user,
            cart,
            subtotal,
            tax,
            gst_rate,
            shipping,
            grandTotal,
            hasUnavailableProduct,
            hasInsufficientStockProduct
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
        if (!user) return res.redirect('/login');

        const initialCartDetails = await cartService.getCartDetails(userId);

        if (!initialCartDetails.cart || !initialCartDetails.cart.items || initialCartDetails.cart.items.length === 0) {
            return res.redirect('/cart');
        }

        if (initialCartDetails.hasUnavailableProduct) {
            return res.redirect('/cart?error=unavailable');
        }

        if (initialCartDetails.hasInsufficientStockProduct) {
            return res.redirect('/cart?error=insufficient_stock');
        }

        // Fetch available coupons, wallet balance, and evaluate highest savings coupon (bestCoupon)
        const subtotalWithTax = initialCartDetails.subtotal + initialCartDetails.tax;
        const [couponData, walletBalance] = await Promise.all([
            couponService.getAvailableCouponsForCheckout(userId, subtotalWithTax),
            getWalletBalance(userId)
        ]);
        
        let activeCouponCode = null;
        let isAutoApplied = false;

        // Priority logic for coupon selection:
        // 1. Explicit query parameter override: ?coupon=CODE
        if (req.query.coupon && req.query.coupon.trim()) {
            activeCouponCode = req.query.coupon.trim().toUpperCase();
            req.session.appliedCouponCode = activeCouponCode;
            delete req.session.couponRemoved;
        } 
        // 2. User clicked "Proceed to Checkout" from cart (?proceed=true or referer from /cart)
        else if (req.query.proceed === 'true' || (req.headers.referer && req.headers.referer.includes('/cart'))) {
            delete req.session.couponRemoved;
            if (couponData.bestCoupon) {
                activeCouponCode = couponData.bestCoupon.code;
                isAutoApplied = true;
                req.session.appliedCouponCode = activeCouponCode;
            } else {
                activeCouponCode = null;
                delete req.session.appliedCouponCode;
            }
        }
        // 3. User explicitly removed coupon in current session
        else if (req.session.couponRemoved === true) {
            activeCouponCode = null;
        } 
        // 4. Persistent manual selection saved in user session
        else if (req.session.appliedCouponCode) {
            activeCouponCode = req.session.appliedCouponCode;
        } 
        // 5. Default auto-apply best coupon if available
        else if (couponData.bestCoupon) {
            activeCouponCode = couponData.bestCoupon.code;
            isAutoApplied = true;
            req.session.appliedCouponCode = activeCouponCode;
        }

        let cartDetails = await cartService.getCartDetails(userId, activeCouponCode);

        // Fallback: If saved session coupon is no longer valid or eligible, clear session coupon
        if (activeCouponCode && (!cartDetails.appliedCoupon || cartDetails.discount <= 0)) {
            activeCouponCode = null;
            delete req.session.appliedCouponCode;
            cartDetails = await cartService.getCartDetails(userId, null);
        }

        res.render('user/checkout', {
            user,
            walletBalance,
            cart: {
                items: cartDetails.cart.items,
                subtotal: cartDetails.subtotal,
                tax: cartDetails.tax,
                shipping: cartDetails.shipping,
                discount: cartDetails.discount,
                appliedCoupon: cartDetails.appliedCoupon,
                grandTotal: cartDetails.grandTotal
            },
            availableCoupons: couponData.allCoupons,
            eligibleCoupons: couponData.eligibleCoupons,
            ineligibleCoupons: couponData.ineligibleCoupons,
            bestCoupon: couponData.bestCoupon,
            autoAppliedCouponCode: isAutoApplied && cartDetails.appliedCoupon ? cartDetails.appliedCoupon.code : null
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

export const getCheckoutFailure = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);

        const activeCouponCode = req.session.appliedCouponCode || null;
        const [cartDetails, walletBalance] = await Promise.all([
            cartService.getCartDetails(userId, activeCouponCode),
            getWalletBalance(userId)
        ]);

        if (!cartDetails.cart || cartDetails.cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const cartCount = await cartService.getCartItemCount(userId);
        const reason = req.query.reason || 'Payment could not be completed or authorization was cancelled.';

        let defaultAddressIndex = -1;
        if (user && user.addresses && user.addresses.length > 0) {
            defaultAddressIndex = user.addresses.findIndex(addr => addr.isDefault);
            if (defaultAddressIndex === -1) defaultAddressIndex = 0;
        }
        const selectedAddress = (user && user.addresses && user.addresses.length > 0 && defaultAddressIndex !== -1) ? user.addresses[defaultAddressIndex] : null;

        res.render('user/order-failure', {
            user,
            cart: {
                items: cartDetails.cart.items,
                subtotal: cartDetails.subtotal,
                tax: cartDetails.tax,
                shipping: cartDetails.shipping,
                discount: cartDetails.discount,
                appliedCoupon: cartDetails.appliedCoupon,
                grandTotal: cartDetails.grandTotal
            },
            selectedAddress,
            walletBalance,
            cartCount,
            reason
        });
    } catch (error) {
        console.error('[getCheckoutFailure] Error:', error);
        res.redirect('/cart');
    }
};

export const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { couponCode } = req.body;

        if (!couponCode || !couponCode.trim()) {
            return res.status(400).json({ success: false, message: 'Please enter a coupon code.' });
        }

        const cleanCode = couponCode.trim().toUpperCase();
        const initialCartDetails = await cartService.getCartDetails(userId);
        const subtotalWithTax = initialCartDetails.subtotal + initialCartDetails.tax;
        const result = await couponService.verifyAndApplyCoupon(cleanCode, userId, subtotalWithTax);

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }

        // Save applied coupon to session (replacing any previous coupon to enforce max 1 coupon limit)
        req.session.appliedCouponCode = cleanCode;
        delete req.session.couponRemoved;

        const updatedCart = await cartService.getCartDetails(userId, cleanCode);

        return res.status(200).json({
            success: true,
            message: result.message,
            cartDetails: {
                subtotal: updatedCart.subtotal,
                subtotalRupees: (updatedCart.subtotal / 100).toFixed(2),
                discount: updatedCart.discount,
                discountRupees: (updatedCart.discount / 100).toFixed(2),
                tax: updatedCart.tax,
                taxRupees: (updatedCart.tax / 100).toFixed(2),
                shipping: updatedCart.shipping,
                shippingRupees: (updatedCart.shipping / 100).toFixed(2),
                grandTotal: updatedCart.grandTotal,
                grandTotalRupees: (updatedCart.grandTotal / 100).toFixed(2),
                appliedCoupon: updatedCart.appliedCoupon
            }
        });
    } catch (error) {
        console.error('[applyCoupon] Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to apply coupon' });
    }
};

export const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;

        // Clear session coupon state and mark explicitly removed
        req.session.appliedCouponCode = null;
        req.session.couponRemoved = true;

        const updatedCart = await cartService.getCartDetails(userId, null);

        return res.status(200).json({
            success: true,
            message: 'Coupon removed.',
            cartDetails: {
                subtotal: updatedCart.subtotal,
                subtotalRupees: (updatedCart.subtotal / 100).toFixed(2),
                discount: 0,
                discountRupees: '0.00',
                tax: updatedCart.tax,
                taxRupees: (updatedCart.tax / 100).toFixed(2),
                shipping: updatedCart.shipping,
                shippingRupees: (updatedCart.shipping / 100).toFixed(2),
                grandTotal: updatedCart.grandTotal,
                grandTotalRupees: (updatedCart.grandTotal / 100).toFixed(2),
                appliedCoupon: null
            }
        });
    } catch (error) {
        console.error('[removeCoupon] Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to remove coupon' });
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
