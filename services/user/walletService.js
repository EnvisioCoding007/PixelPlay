import { getOrCreateWallet, addTransaction, getWalletBalance } from '../shared/walletHelper.js';

export { getWalletBalance };

/**
 * Retrieves user wallet details with formatted rupee amounts, period analytics,
 * and filtered/sorted paginated transaction history.
 * 
 * @param {string} userId 
 * @param {Object|number} [options={}] - Options object or legacy page number
 */
export const getUserWallet = async (userId, options = {}) => {
    const opts = typeof options === 'number' ? { page: options } : (options || {});
    const {
        page = 1,
        limit = 10,
        type = 'all',
        period = 'all',
        startDate = null,
        endDate = null,
        sort = 'newest'
    } = opts;

    const wallet = await getOrCreateWallet(userId);
    let rawTxns = wallet.transactions ? [...wallet.transactions] : [];

    // 1. Filter by Transaction Type ('credit', 'debit', or 'all')
    if (type === 'credit' || type === 'debit') {
        rawTxns = rawTxns.filter(t => t.type === type);
    }

    // 2. Filter by Date / Period Preset
    const now = new Date();
    if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        rawTxns = rawTxns.filter(t => new Date(t.date) >= weekAgo);
    } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        rawTxns = rawTxns.filter(t => new Date(t.date) >= monthAgo);
    } else if (period === 'year') {
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        rawTxns = rawTxns.filter(t => new Date(t.date) >= yearAgo);
    } else if (period === 'custom' || startDate || endDate) {
        if (startDate) {
            const start = new Date(startDate);
            if (!isNaN(start.getTime())) {
                rawTxns = rawTxns.filter(t => new Date(t.date) >= start);
            }
        }
        if (endDate) {
            const end = new Date(endDate);
            if (!isNaN(end.getTime())) {
                end.setHours(23, 59, 59, 999);
                rawTxns = rawTxns.filter(t => new Date(t.date) <= end);
            }
        }
    }

    // 3. Compute Period Overview Metrics (across filtered transactions)
    let totalCreditsPaisa = 0;
    let totalDebitsPaisa = 0;

    rawTxns.forEach(t => {
        if (t.type === 'credit') {
            totalCreditsPaisa += (t.amount || 0);
        } else if (t.type === 'debit') {
            totalDebitsPaisa += (t.amount || 0);
        }
    });

    const netFlowPaisa = totalCreditsPaisa - totalDebitsPaisa;

    const periodOverview = {
        totalCreditsPaisa,
        totalCreditsRupees: (totalCreditsPaisa / 100).toFixed(2),
        totalDebitsPaisa,
        totalDebitsRupees: (totalDebitsPaisa / 100).toFixed(2),
        netFlowPaisa,
        netFlowRupees: (Math.abs(netFlowPaisa) / 100).toFixed(2),
        isNetFlowPositive: netFlowPaisa >= 0,
        transactionCount: rawTxns.length
    };

    // 4. Sort Transactions
    rawTxns.sort((a, b) => {
        if (sort === 'oldest') {
            return new Date(a.date) - new Date(b.date);
        } else if (sort === 'amount_desc') {
            return (b.amount || 0) - (a.amount || 0);
        } else if (sort === 'amount_asc') {
            return (a.amount || 0) - (b.amount || 0);
        } else { // 'newest' default
            return new Date(b.date) - new Date(a.date);
        }
    });

    // 5. Paginate Transactions
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const totalTransactions = rawTxns.length;
    const totalPages = Math.ceil(totalTransactions / limitNum) || 1;
    const skip = (pageNum - 1) * limitNum;

    const paginatedTxns = rawTxns.slice(skip, skip + limitNum).map(t => ({
        _id: t._id,
        transactionId: t.transactionId,
        amountPaisa: t.amount,
        amountRupees: ((t.amount || 0) / 100).toFixed(2),
        type: t.type,
        orderId: t.orderId,
        description: t.description,
        date: t.date,
        status: t.status
    }));

    return {
        balancePaisa: wallet.balance,
        balanceRupees: (wallet.balance / 100).toFixed(2),
        transactions: paginatedTxns,
        totalTransactions,
        totalPages,
        currentPage: pageNum,
        periodOverview,
        filters: {
            type,
            period,
            startDate: startDate || '',
            endDate: endDate || '',
            sort
        }
    };
};

import { createRazorpayOrder, verifyRazorpaySignature, getRazorpayKeyId } from '../shared/razorpayHelper.js';

/**
 * Top-up funds into user's wallet.
 * 
 * @param {string} userId 
 * @param {number} amountInRupees 
 * @param {string} transactionId 
 */
export const addFundsToWallet = async (userId, amountInRupees, transactionId = null) => {
    const numRupees = Number(amountInRupees);
    if (isNaN(numRupees) || numRupees <= 0) {
        throw new Error('Please enter a valid amount greater than ₹0');
    }
    if (numRupees > 50000) {
        throw new Error('Maximum top-up amount allowed at one time is ₹50,000');
    }

    const amountInPaisa = Math.round(numRupees * 100);

    const result = await addTransaction(userId, {
        amount: amountInPaisa,
        type: 'credit',
        description: transactionId ? `Wallet Top-up (Razorpay Txn: ${transactionId})` : 'Wallet Top-up',
        transactionId: transactionId || undefined,
        status: 'Success'
    });

    return result;
};

/**
 * Creates a Razorpay order for wallet top-up.
 * 
 * @param {string} userId 
 * @param {number} amountInRupees 
 */
export const createWalletRazorpayOrder = async (userId, amountInRupees) => {
    const numRupees = Number(amountInRupees);
    if (isNaN(numRupees) || numRupees <= 0) {
        throw new Error('Please enter a valid top-up amount greater than ₹0.');
    }
    if (numRupees > 50000) {
        throw new Error('Maximum top-up amount allowed at one time is ₹50,000.');
    }

    const amountInPaisa = Math.round(numRupees * 100);
    const receiptId = `wtop_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const rzpOrder = await createRazorpayOrder(amountInPaisa, receiptId);

    return {
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: getRazorpayKeyId(),
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        amountRupees: numRupees.toFixed(2)
    };
};

/**
 * Verifies Razorpay payment signature and credits top-up funds to user's wallet.
 * 
 * @param {string} userId 
 * @param {number} amountInRupees 
 * @param {string} razorpayOrderId 
 * @param {string} razorpayPaymentId 
 * @param {string} razorpaySignature 
 */
export const verifyAndCompleteWalletTopup = async (userId, amountInRupees, razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
        throw new Error('Razorpay top-up signature verification failed.');
    }

    const result = await addFundsToWallet(userId, amountInRupees, razorpayPaymentId);
    return {
        success: true,
        wallet: result.wallet,
        message: `Successfully added ₹${parseFloat(amountInRupees).toFixed(2)} to your PixelWallet!`
    };
};

/**
 * Debit funds from user's wallet for order payment.
 * 
 * @param {string} userId 
 * @param {number} amountInPaisa 
 * @param {string} orderId 
 */
export const processWalletPayment = async (userId, amountInPaisa, orderId) => {
    return await addTransaction(userId, {
        amount: amountInPaisa,
        type: 'debit',
        orderId,
        description: `Payment for Order #${orderId}`,
        status: 'Success'
    });
};

/**
 * Credit funds to user's wallet for order or item refund.
 * 
 * @param {string} userId 
 * @param {number} amountInPaisa 
 * @param {string} orderId 
 * @param {string} reason 
 */
export const processWalletRefund = async (userId, amountInPaisa, orderId, reason) => {
    return await addTransaction(userId, {
        amount: amountInPaisa,
        type: 'credit',
        orderId,
        description: reason || `Refund for Order #${orderId}`,
        status: 'Success'
    });
};
