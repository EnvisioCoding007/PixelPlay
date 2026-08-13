import * as userService from '../../services/userService.js';

export const getCustomers = async (req, res) => {
    try {
        const { page = 1, search = '', limit = 10, status = '', tier = '', sort = '-createdAt', verification = '' } = req.query;

        const result = await userService.getCustomers(search, status, verification, sort, page, limit);

        const currentFilters = {};
        if (search) currentFilters.search = search;
        if (status) currentFilters.status = status;
        if (tier) currentFilters.tier = tier;
        if (sort && sort !== '-createdAt') currentFilters.sort = sort;
        if (verification) currentFilters.verification = verification;

        res.render('admin/customer-management', {
            users: result.users,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            search,
            status,
            tier,
            sort,
            verification,
            currentSearch: search,
            currentStatus: status,
            currentSort: sort,
            currentVerification: verification,
            currentFilters,
            limit: parseInt(limit, 10),
        });
    } catch (err) {
        console.error('[getCustomers]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const toggleBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await userService.toggleUserBlock(id);

        return res.status(200).json({
            success: true,
            is_blocked: result.is_blocked,
            message: result.message,
        });
    } catch (err) {
        console.error('[toggleBlock]', err);
        return res.status(500).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};
