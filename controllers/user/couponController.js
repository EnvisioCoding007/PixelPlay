import * as userCouponService from '../../services/user/couponService.js';

/**
 * Fetches active available coupons for the current user and cart subtotal.
 */
export const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.user?._id || req.session?.user?._id || null;
        const subtotalPaisa = req.query.subtotalPaisa 
            ? parseInt(req.query.subtotalPaisa, 10)
            : (req.query.subtotal ? Math.round(parseFloat(req.query.subtotal) * 100) : 0);

        const availableCoupons = await userCouponService.getAvailableCouponsForUser(userId, subtotalPaisa);

        return res.json({
            success: true,
            coupons: availableCoupons
        });
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to retrieve available coupons'
        });
    }
};

/**
 * Validates and applies a coupon code to the user's current order/cart subtotal.
 */
export const applyCoupon = async (req, res) => {
    try {
        const { couponCode, subtotalPaisa, subtotalRupees } = req.body;
        const userId = req.user?._id || req.session?.user?._id || null;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to apply coupons'
            });
        }

        const subtotal = subtotalPaisa !== undefined 
            ? parseInt(subtotalPaisa, 10) 
            : Math.round(parseFloat(subtotalRupees || 0) * 100);

        const result = await userCouponService.verifyAndApplyCoupon(couponCode, userId, subtotal);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error('Error applying coupon:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to apply coupon'
        });
    }
};
