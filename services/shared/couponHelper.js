import Coupon from '../../models/Coupon.js';

/**
 * Calculates the discount amount in Paisa based on discount type and maximum cap.
 * 
 * @param {Object} coupon - Coupon document or object
 * @param {number} subtotalPaisa - Subtotal in Paisa (integer)
 * @returns {number} Calculated discount in Paisa (integer)
 */
export const calculateDiscountAmount = (coupon, subtotalPaisa) => {
    const subtotal = Math.max(0, Math.round(Number(subtotalPaisa) || 0));
    let rawDiscount = 0;

    if (coupon.discountType === 'percentage') {
        rawDiscount = Math.round((subtotal * Number(coupon.discountValue)) / 100);
        if (coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount !== undefined && coupon.maxDiscountAmount > 0) {
            rawDiscount = Math.min(rawDiscount, Number(coupon.maxDiscountAmount));
        }
    } else if (coupon.discountType === 'flat') {
        rawDiscount = Number(coupon.discountValue);
    }

    // Discount cannot exceed the subtotal
    const discountPaisa = Math.min(Math.max(0, rawDiscount), subtotal);
    return discountPaisa;
};

/**
 * Validates whether a coupon code is eligible for a specific user and order subtotal.
 * 
 * @param {string} couponCode - Case-insensitive coupon code
 * @param {string|ObjectId} userId - User ID attempting to use the coupon
 * @param {number} subtotalPaisa - Subtotal in Paisa (integer)
 * @returns {Promise<{ valid: boolean, message?: string, coupon?: Object, discountPaisa?: number, finalAmountPaisa?: number }>}
 */
export const validateCouponEligibility = async (couponCode, userId, subtotalPaisa) => {
    if (!couponCode || !couponCode.trim()) {
        return { valid: false, message: 'Coupon code is required' };
    }

    const code = couponCode.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code });

    if (!coupon) {
        return { valid: false, message: 'Invalid coupon code' };
    }

    if (!coupon.isActive) {
        return { valid: false, message: 'This coupon is inactive' };
    }

    const now = new Date();
    if (coupon.startDate && now < new Date(coupon.startDate)) {
        return { valid: false, message: 'Coupon is not yet active' };
    }

    if (now > new Date(coupon.expiryDate)) {
        return { valid: false, message: 'Coupon has expired' };
    }

    if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
        return { valid: false, message: 'Coupon global usage limit reached' };
    }

    const subtotal = Math.max(0, Math.round(Number(subtotalPaisa) || 0));
    if (subtotal < coupon.minOrderAmount) {
        const minRupees = (coupon.minOrderAmount / 100).toFixed(2);
        return { 
            valid: false, 
            message: `Minimum order amount of ₹${minRupees} required to apply coupon ${coupon.code}` 
        };
    }

    if (userId) {
        const userIdStr = userId.toString();
        const userUsage = (coupon.usedBy || []).find(u => u.userId.toString() === userIdStr);
        const currentCount = userUsage ? userUsage.usedCount : 0;

        if (currentCount >= coupon.perUserLimit) {
            return { valid: false, message: 'You have already used this coupon' };
        }
    }

    const discountPaisa = calculateDiscountAmount(coupon, subtotal);
    const finalAmountPaisa = Math.max(0, subtotal - discountPaisa);

    return {
        valid: true,
        coupon,
        discountPaisa,
        finalAmountPaisa
    };
};

/**
 * Atomically records the redemption of a coupon by a user.
 * 
 * @param {string|ObjectId} couponId 
 * @param {string|ObjectId} userId 
 */
export const recordCouponUsage = async (couponId, userId) => {
    if (!couponId || !userId) return null;

    // Try to update existing user entry in usedBy
    const updated = await Coupon.findOneAndUpdate(
        { _id: couponId, 'usedBy.userId': userId },
        { 
            $inc: { usedCount: 1, 'usedBy.$.usedCount': 1 }, 
            $set: { 'usedBy.$.lastUsedAt': new Date() } 
        },
        { returnDocument: 'after' }
    );

    if (updated) {
        return updated;
    }

    // User is using coupon for the first time, push to usedBy array
    return await Coupon.findByIdAndUpdate(
        couponId,
        {
            $inc: { usedCount: 1 },
            $push: {
                usedBy: {
                    userId,
                    usedCount: 1,
                    lastUsedAt: new Date()
                }
            }
        },
        { returnDocument: 'after' }
    );
};

/**
 * Decrements user and global usage count if an order is cancelled or payment fails.
 * 
 * @param {string|ObjectId} couponId 
 * @param {string|ObjectId} userId 
 */
export const releaseCouponUsage = async (couponId, userId) => {
    if (!couponId || !userId) return null;

    return await Coupon.findOneAndUpdate(
        { _id: couponId, 'usedBy.userId': userId, 'usedBy.usedCount': { $gt: 0 } },
        {
            $inc: { usedCount: -1, 'usedBy.$.usedCount': -1 }
        },
        { returnDocument: 'after' }
    );
};
