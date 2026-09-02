import { getWalletOversight, adjustUserWalletAdmin } from '../../services/admin/walletService.js';

/**
 * Renders the Admin Wallet Oversight dashboard.
 */
export const getWalletOversightPage = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const oversightData = await getWalletOversight(search, page, limit);

        res.render('admin/wallet-oversight', {
            activeTab: 'wallet-oversight',
            currentTab: 'wallet-oversight',
            search,
            ...oversightData,
            title: 'Wallet Oversight · Admin Panel',
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Error rendering Admin Wallet Oversight page:', error);
        res.status(500).render('admin/wallet-oversight', {
            activeTab: 'wallet-oversight',
            currentTab: 'wallet-oversight',
            search: '',
            wallets: [],
            allUsers: [],
            totalCount: 0,
            totalPages: 1,
            currentPage: 1,
            totalLiabilityRupees: '0.00',
            totalTransactionsCount: 0,
            title: 'Wallet Oversight · Admin Panel',
            error: error.message || 'Failed to load wallet oversight data',
            success: null
        });
    }
};

/**
 * Handles admin manual adjustment (credit/debit) of a user's wallet.
 */
export const adjustUserWallet = async (req, res) => {
    try {
        const { userId, amount, type, description } = req.body;

        const result = await adjustUserWalletAdmin(userId, amount, type, description);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Successfully processed ${type} of ₹${parseFloat(amount).toFixed(2)} for user.`,
                newBalanceRupees: (result.wallet.balance / 100).toFixed(2)
            });
        }

        res.redirect(`/admin/wallet-oversight?success=${encodeURIComponent(`Successfully processed ${type} of ₹${parseFloat(amount).toFixed(2)}`)}`);
    } catch (error) {
        console.error('Error adjusting user wallet balance:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({
                success: false,
                message: error.message || 'Failed to adjust wallet balance'
            });
        }
        res.redirect(`/admin/wallet-oversight?error=${encodeURIComponent(error.message || 'Failed to adjust wallet balance')}`);
    }
};
