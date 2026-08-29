import { getUserWallet, addFundsToWallet, createWalletRazorpayOrder as serviceCreateOrder, verifyAndCompleteWalletTopup } from '../../services/user/walletService.js';

export const createWalletRazorpayOrder = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const { amount } = req.body;
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Please enter a valid top-up amount.' });
        }

        const data = await serviceCreateOrder(userId, amount);

        res.status(200).json({
            success: true,
            ...data
        });
    } catch (error) {
        console.error('[createWalletRazorpayOrder] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const verifyWalletRazorpayPayment = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const { amount, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if (!amount || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid top-up payment parameters.' });
        }

        const result = await verifyAndCompleteWalletTopup(
            userId,
            amount,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        res.status(200).json({
            success: true,
            message: result.message,
            newBalanceRupees: (result.wallet.balance / 100).toFixed(2)
        });
    } catch (error) {
        console.error('[verifyWalletRazorpayPayment] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};
import * as userService from '../../services/user/userService.js';

/**
 * Helper function to safely extract logged in User ID from session or request.
 */
const getAuthUserId = (req) => {
    if (req.session && req.session.user) {
        return req.session.user._id || req.session.user.id || req.session.user;
    }
    if (req.user) {
        return req.user._id || req.user.id || req.user;
    }
    return null;
};

/**
 * Renders the user wallet page with filtering, sorting, and overview analytics.
 */
export const getWalletPage = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await userService.getUserById(userId);
        if (!user) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const type = req.query.type || 'all';
        const period = req.query.period || 'all';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const sort = req.query.sort || 'newest';

        const wallet = await getUserWallet(userId, {
            page,
            limit,
            type,
            period,
            startDate,
            endDate,
            sort
        });

        res.render('user/wallet', {
            user,
            wallet,
            activeTab: 'wallet',
            page,
            totalPages: wallet.totalPages,
            filters: wallet.filters,
            periodOverview: wallet.periodOverview,
            title: 'My PixelWallet · PixelPlay',
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Error rendering wallet page:', error);
        const userId = getAuthUserId(req);
        const user = userId ? await userService.getUserById(userId).catch(() => null) : null;

        res.status(500).render('user/wallet', {
            user: user || null,
            wallet: {
                balanceRupees: '0.00',
                transactions: [],
                totalTransactions: 0,
                totalPages: 1,
                currentPage: 1
            },
            activeTab: 'wallet',
            page: 1,
            totalPages: 1,
            filters: { type: 'all', period: 'all', startDate: '', endDate: '', sort: 'newest' },
            periodOverview: {
                totalCreditsRupees: '0.00',
                totalDebitsRupees: '0.00',
                netFlowRupees: '0.00',
                isNetFlowPositive: true,
                transactionCount: 0
            },
            title: 'My PixelWallet · PixelPlay',
            error: error.message || 'Failed to load wallet information',
            success: null
        });
    }
};

/**
 * Handles adding funds to the user's wallet.
 */
export const addFunds = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            throw new Error('Authentication required.');
        }

        const { amount } = req.body;
        const result = await addFundsToWallet(userId, amount);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Successfully added ₹${parseFloat(amount).toFixed(2)} to your PixelWallet!`,
                newBalanceRupees: (result.wallet.balance / 100).toFixed(2)
            });
        }

        res.redirect(`/wallet?success=${encodeURIComponent(`Successfully added ₹${parseFloat(amount).toFixed(2)} to your PixelWallet!`)}`);
    } catch (error) {
        console.error('Error adding funds to wallet:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({
                success: false,
                message: error.message || 'Failed to add funds to wallet'
            });
        }
        res.redirect(`/wallet?error=${encodeURIComponent(error.message || 'Failed to add funds')}`);
    }
};
