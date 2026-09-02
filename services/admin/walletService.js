import Wallet from '../../models/Wallet.js';
import User from '../../models/User.js';
import { addTransaction } from '../shared/walletHelper.js';

/**
 * Retrieves platform-wide wallet statistics, user wallets, and global transaction audit logs for admin oversight.
 * 
 * @param {string} search 
 * @param {number} page 
 * @param {number} limit 
 */
export const getWalletOversight = async (search = '', page = 1, limit = 10) => {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    // First ensure wallets exist for users that might not have one initialized yet
    const filter = {};

    if (search && search.trim()) {
        const searchStr = search.trim();
        const matchingUsers = await User.find({
            $or: [
                { username: { $regex: searchStr, $options: 'i' } },
                { email: { $regex: searchStr, $options: 'i' } }
            ]
        }).select('_id');

        const userIds = matchingUsers.map(u => u._id);
        filter.$or = [
            { userId: { $in: userIds } },
            { 'transactions.orderId': { $regex: searchStr, $options: 'i' } }
        ];
    }

    const [wallets, totalCount, totalLiabilityAgg, allUsers] = await Promise.all([
        Wallet.find(filter)
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('userId', 'username email profile_image')
            .lean(),
        Wallet.countDocuments(filter),
        Wallet.aggregate([
            { $group: { _id: null, totalBalance: { $sum: '$balance' }, totalTxns: { $sum: { $size: '$transactions' } } } }
        ]),
        User.find({ role: { $ne: 'admin' } })
            .select('username email _id')
            .sort({ username: 1 })
            .lean()
    ]);

    const totalLiabilityPaisa = totalLiabilityAgg.length > 0 ? totalLiabilityAgg[0].totalBalance : 0;
    const totalTransactionsCount = totalLiabilityAgg.length > 0 ? totalLiabilityAgg[0].totalTxns : 0;

    const formattedWallets = wallets.map(w => ({
        ...w,
        balanceRupees: (w.balance / 100).toFixed(2),
        recentTransactions: (w.transactions || []).slice(0, 5).map(t => ({
            ...t,
            amountRupees: (t.amount / 100).toFixed(2)
        }))
    }));

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        wallets: formattedWallets,
        allUsers,
        totalCount,
        totalPages,
        currentPage: pageNum,
        totalLiabilityRupees: (totalLiabilityPaisa / 100).toFixed(2),
        totalTransactionsCount
    };
};

/**
 * Admin manual credit/debit adjustment to a user's wallet.
 * 
 * @param {string} userId 
 * @param {number} amountInRupees 
 * @param {'credit'|'debit'} type 
 * @param {string} description 
 */
export const adjustUserWalletAdmin = async (userId, amountInRupees, type, description) => {
    const numRupees = Number(amountInRupees);
    if (isNaN(numRupees) || numRupees <= 0) {
        throw new Error('Please specify a valid amount greater than ₹0');
    }
    if (!['credit', 'debit'].includes(type)) {
        throw new Error('Adjustment type must be credit or debit');
    }

    const amountInPaisa = Math.round(numRupees * 100);
    const desc = description && description.trim() 
        ? description.trim() 
        : `Admin Adjustment (${type === 'credit' ? 'Credit' : 'Debit'})`;

    return await addTransaction(userId, {
        amount: amountInPaisa,
        type,
        description: desc,
        status: 'Success'
    });
};
