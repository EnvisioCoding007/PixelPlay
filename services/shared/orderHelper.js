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

export {
    calculateItemWeightageRatio,
    calculateOrderRefundDistribution,
    countActiveOrderItems,
    calculateItemRefundBreakdown,
    calculateItemRefundAmount,
    assertOrderRefundBalance
} from './refundService.js';

export {
    extractTaxFromGross,
    extractTaxFromRefund,
    calculateGrossFromBase
} from './taxHelper.js';

