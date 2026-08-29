import Wallet from '../../models/Wallet.js';
import User from '../../models/User.js';
import { createNotificationForUser } from './notificationHelper.js';

/**
 * Gets existing user wallet or lazily creates a new one,
 * initializing balance from User.walletBalance if available.
 */
export const getOrCreateWallet = async (userId) => {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
        const user = await User.findById(userId);
        const initialBalance = user ? (user.walletBalance || 0) : 0;
        
        wallet = new Wallet({
            userId,
            balance: initialBalance,
            transactions: initialBalance > 0 ? [{
                amount: initialBalance,
                type: 'credit',
                description: 'Initial Wallet Balance',
                status: 'Success'
            }] : []
        });
        await wallet.save();
    }
    return wallet;
};

/**
 * Gets user wallet balance in integer Paisa.
 */
export const getWalletBalance = async (userId) => {
    const wallet = await getOrCreateWallet(userId);
    return wallet ? wallet.balance : 0;
};

/**
 * Atomically processes a transaction (credit/debit), updates balance,
 * logs ledger entry, and syncs legacy User.walletBalance.
 * 
 * @param {string|ObjectId} userId 
 * @param {Object} txnDetails 
 * @param {number} txnDetails.amount - Integer paisa
 * @param {'credit'|'debit'} txnDetails.type
 * @param {string} [txnDetails.orderId]
 * @param {string} txnDetails.description
 * @param {'Success'|'Pending'|'Failed'} [txnDetails.status='Success']
 */
export const addTransaction = async (userId, { amount, type, orderId = null, description, status = 'Success' }) => {
    const roundedAmount = Math.round(Number(amount));
    if (isNaN(roundedAmount) || roundedAmount < 0) {
        throw new Error('Invalid transaction amount');
    }
    if (!['credit', 'debit'].includes(type)) {
        throw new Error('Invalid transaction type. Must be credit or debit');
    }
    if (!description) {
        throw new Error('Transaction description is required');
    }

    // Ensure wallet exists before atomic operation
    await getOrCreateWallet(userId);

    if (type === 'debit') {
        // Atomic check & update: balance must be >= roundedAmount
        const updatedWallet = await Wallet.findOneAndUpdate(
            { userId, balance: { $gte: roundedAmount } },
            {
                $inc: { balance: -roundedAmount },
                $push: {
                    transactions: {
                        $each: [{
                            amount: roundedAmount,
                            type: 'debit',
                            orderId,
                            description,
                            status,
                            date: new Date()
                        }],
                        $position: 0
                    }
                }
            },
            { new: true, returnDocument: 'after' }
        );

        if (!updatedWallet) {
            const currentWallet = await Wallet.findOne({ userId });
            const currBalance = currentWallet ? currentWallet.balance : 0;
            throw new Error(`Insufficient wallet balance. You need ₹${(roundedAmount / 100).toFixed(2)} but only have ₹${(currBalance / 100).toFixed(2)}.`);
        }

        // Sync User.walletBalance
        await User.findByIdAndUpdate(userId, { balance: updatedWallet.balance, walletBalance: updatedWallet.balance });
        return { wallet: updatedWallet, transaction: updatedWallet.transactions[0] };
    } else {
        // Credit transaction
        const updatedWallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $inc: { balance: roundedAmount },
                $push: {
                    transactions: {
                        $each: [{
                            amount: roundedAmount,
                            type: 'credit',
                            orderId,
                            description,
                            status,
                            date: new Date()
                        }],
                        $position: 0
                    }
                }
            },
            { new: true, returnDocument: 'after' }
        );

        // Sync User.walletBalance
        await User.findByIdAndUpdate(userId, { balance: updatedWallet.balance, walletBalance: updatedWallet.balance });

        // Dispatch PixelWallet Credit Notification
        if (status === 'Success') {
            createNotificationForUser(userId, {
                type: 'wallet_credit',
                title: 'PixelWallet Credited',
                message: `₹${(roundedAmount / 100).toFixed(2)} was credited to your PixelWallet (${description}).`,
                link: '/wallet',
                metadata: { amount: roundedAmount, orderId, description }
            }).catch(err => console.error('[addTransaction Notification Error]', err));
        }

        return { wallet: updatedWallet, transaction: updatedWallet.transactions[0] };
    }
};

