import User from '../../models/User.js';
import Order from '../../models/Order.js';
import { addTransaction } from './walletHelper.js';

/**
 * Checks if this is the user's first completed/placed order. If the user was referred
 * by another user, credits Rs. 100 (10,000 Paisa) to both the referrer and referee.
 * 
 * @param {string|ObjectId} userId - ID of the user placing the order
 * @param {string|ObjectId} currentOrderId - ID of the current order document
 */
export const processReferralRewardsOnFirstOrder = async (userId, currentOrderId) => {
    try {
        const user = await User.findById(userId);
        if (!user || user.is_referral_rewarded || !user.referred_by) {
            return;
        }

        // Verify this is the user's first non-failed order
        const priorOrdersCount = await Order.countDocuments({
            userId,
            _id: { $ne: currentOrderId },
            paymentStatus: { $ne: 'Failed' }
        });

        if (priorOrdersCount > 0) {
            return;
        }

        // Find referrer user by referral_code or ID
        const cleanRefCode = user.referred_by.trim().toUpperCase();
        let referrer = await User.findOne({ referral_code: cleanRefCode });
        if (!referrer && user.referred_by.length === 24) {
            referrer = await User.findById(user.referred_by);
        }

        if (!referrer || referrer._id.toString() === userId.toString()) {
            return;
        }

        const REWARD_AMOUNT_PAISA = 10000; // Rs. 100 in Paisa

        // Credit Referee (New User placing first order)
        await addTransaction(userId, {
            amount: REWARD_AMOUNT_PAISA,
            type: 'credit',
            description: 'Welcome Referral Bonus (First Order)',
            status: 'Success'
        });

        // Credit Referrer (User who shared the code)
        await addTransaction(referrer._id, {
            amount: REWARD_AMOUNT_PAISA,
            type: 'credit',
            description: `Referral Reward (From ${user.username}'s First Order)`,
            status: 'Success'
        });

        // Mark user as rewarded to prevent duplicate reward credits
        user.is_referral_rewarded = true;
        await user.save();
    } catch (err) {
        console.error('[processReferralRewardsOnFirstOrder] Error:', err);
    }
};

/**
 * Helper function to calculate item refund amount for cancellation or return,
 * after deducting proportional coupon discount per item unit and adding proportional
 * shipping charge split per item unit.
 * 
 * @param {Object} order - Order document
 * @param {Object} item - Order item document
 * @param {number} qtyToRefund - Quantity of item being cancelled or returned
 * @param {number} [itemGstRate] - GST rate for tax inclusive calculation
 * @returns {number} Net refund amount in Paisa
 */
export const calculateItemRefundAmount = (order, item, qtyToRefund, itemGstRate = null) => {
    if (!order || !item || !qtyToRefund || qtyToRefund <= 0) {
        return 0;
    }

    // Determine GST rate
    const gstRate = (typeof itemGstRate === 'number' && !isNaN(itemGstRate))
        ? itemGstRate
        : ((typeof item.gst_rate === 'number') ? item.gst_rate : 18);

    // Calculate gross unit price including tax
    const unitTaxInclusive = Math.round((item.price * 100) / (100 - gstRate));
    const grossRefundAmount = unitTaxInclusive * qtyToRefund;

    // Calculate total number of units/items in the order
    const totalOrderUnits = (order.items && order.items.length > 0)
        ? order.items.reduce((sum, i) => sum + (i.quantity || 0), 0)
        : 0;

    // Proportional coupon discount per unit
    const couponDiscount = order.discount || 0;
    const couponDiscountPerUnit = (couponDiscount > 0 && totalOrderUnits > 0)
        ? Math.floor(couponDiscount / totalOrderUnits)
        : 0;

    // Proportional shipping charge split per unit
    const shippingFee = order.shipping || 0;
    const shippingFeePerUnit = (shippingFee > 0 && totalOrderUnits > 0)
        ? Math.floor(shippingFee / totalOrderUnits)
        : 0;

    const totalAllocatedCouponDiscount = couponDiscountPerUnit * qtyToRefund;
    const totalAllocatedShippingFee = shippingFeePerUnit * qtyToRefund;

    // Net refund credited after deducting divided coupon amount and adding divided shipping share
    let netRefundAmount = Math.max(0, grossRefundAmount - totalAllocatedCouponDiscount + totalAllocatedShippingFee);

    // Safeguard: If all units in the order are being refunded (e.g. qtyToRefund === totalOrderUnits),
    // ensure exact match to order finalAmount
    if (totalOrderUnits > 0 && qtyToRefund === totalOrderUnits) {
        netRefundAmount = (typeof order.finalAmount === 'number') ? order.finalAmount : netRefundAmount;
    }

    return netRefundAmount;
};
