import Coupon from '../../models/Coupon.js';
import { validateCouponEligibility, calculateDiscountAmount } from '../shared/couponHelper.js';

/**
 * Retrieves all active, non-expired coupons available for a user given their cart subtotal.
 * 
 * @param {string|ObjectId} userId 
 * @param {number} cartSubtotalPaisa - Cart subtotal in Paisa (integer)
 */
export const getAvailableCouponsForUser = async (userId, cartSubtotalPaisa = 0) => {
    const checkoutData = await getAvailableCouponsForCheckout(userId, cartSubtotalPaisa);
    return checkoutData.allCoupons;
};

/**
 * Evaluates all coupons for checkout, sorts eligible coupons by savings (descending),
 * and identifies the coupon with the highest savings (bestCoupon).
 * 
 * @param {string|ObjectId} userId 
 * @param {number} cartSubtotalPaisa 
 */
export const getAvailableCouponsForCheckout = async (userId, cartSubtotalPaisa = 0) => {
    const now = new Date();
    const activeCoupons = await Coupon.find({
        isActive: true,
        expiryDate: { $gte: now },
        $or: [
            { startDate: { $exists: false } },
            { startDate: null },
            { startDate: { $lte: now } }
        ]
    }).sort({ minOrderAmount: 1 }).lean();

    const userIdStr = userId ? userId.toString() : null;
    const cartSubtotal = Math.max(0, Math.round(Number(cartSubtotalPaisa) || 0));

    const eligibleCoupons = [];
    const ineligibleCoupons = [];

    for (const coupon of activeCoupons) {
        // Check global usage limit
        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            continue;
        }

        // Check per-user usage limit
        if (userIdStr) {
            const userUsage = (coupon.usedBy || []).find(u => u.userId.toString() === userIdStr);
            const userCount = userUsage ? userUsage.usedCount : 0;
            if (userCount >= coupon.perUserLimit) {
                continue;
            }
        }

        const isMinimumMet = cartSubtotal >= coupon.minOrderAmount;
        const discountPaisa = isMinimumMet ? calculateDiscountAmount(coupon, cartSubtotal) : 0;
        const minRupeesNeeded = !isMinimumMet ? ((coupon.minOrderAmount - cartSubtotal) / 100).toFixed(2) : '0.00';

        const formatted = {
            id: coupon._id.toString(),
            code: coupon.code,
            description: coupon.description || `${coupon.discountType === 'percentage' ? coupon.discountValue + '%' : '₹' + (coupon.discountValue / 100).toFixed(2)} OFF`,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountDisplay: coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `₹${(coupon.discountValue / 100).toFixed(2)} OFF`,
            minOrderRupees: (coupon.minOrderAmount / 100).toFixed(2),
            minOrderPaisa: coupon.minOrderAmount,
            maxDiscountRupees: coupon.maxDiscountAmount ? (coupon.maxDiscountAmount / 100).toFixed(2) : null,
            expiryDate: coupon.expiryDate,
            isMinimumMet,
            discountPaisa,
            discountRupees: (discountPaisa / 100).toFixed(2),
            minRupeesNeeded
        };

        if (isMinimumMet && discountPaisa > 0) {
            eligibleCoupons.push(formatted);
        } else {
            ineligibleCoupons.push(formatted);
        }
    }

    // Sort eligible coupons by discount savings descending (highest savings first)
    eligibleCoupons.sort((a, b) => b.discountPaisa - a.discountPaisa);

    const bestCoupon = eligibleCoupons.length > 0 ? eligibleCoupons[0] : null;

    return {
        allCoupons: [...eligibleCoupons, ...ineligibleCoupons],
        eligibleCoupons,
        ineligibleCoupons,
        bestCoupon
    };
};

/**
 * Validates a coupon code for user's cart subtotal and calculates discount.
 * 
 * @param {string} couponCode 
 * @param {string|ObjectId} userId 
 * @param {number} cartSubtotalPaisa 
 */
export const verifyAndApplyCoupon = async (couponCode, userId, cartSubtotalPaisa) => {
    const result = await validateCouponEligibility(couponCode, userId, cartSubtotalPaisa);
    if (!result.valid) {
        return {
            success: false,
            message: result.message
        };
    }

    const { coupon, discountPaisa, finalAmountPaisa } = result;

    return {
        success: true,
        message: `Coupon '${coupon.code}' applied successfully!`,
        coupon: {
            id: coupon._id.toString(),
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            description: coupon.description
        },
        discountPaisa,
        discountRupees: (discountPaisa / 100).toFixed(2),
        finalAmountPaisa,
        finalAmountRupees: (finalAmountPaisa / 100).toFixed(2)
    };
};
