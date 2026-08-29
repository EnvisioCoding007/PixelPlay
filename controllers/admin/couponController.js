import * as adminCouponService from '../../services/admin/couponService.js';

/**
 * Renders the Admin Coupon Management page or returns coupon list JSON.
 */
export const getCouponsPage = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const statusFilter = req.query.status || 'all';

        const data = await adminCouponService.getAdminCoupons(search, page, limit, statusFilter);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, ...data });
        }

        res.render('admin/listed-coupons', {
            currentTab: 'coupons',
            search,
            statusFilter,
            ...data,
            title: 'Coupon Management · Admin Panel',
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Error in getCouponsPage:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to load coupons' });
        }
        res.status(500).render('admin/listed-coupons', {
            currentTab: 'coupons',
            search: '',
            statusFilter: 'all',
            coupons: [],
            totalCount: 0,
            totalPages: 1,
            currentPage: 1,
            totalCouponsCount: 0,
            activeCouponsCount: 0,
            expiredCouponsCount: 0,
            totalRedemptionsCount: 0,
            title: 'Coupon Management · Admin Panel',
            error: error.message || 'Failed to load coupons',
            success: null
        });
    }
};

/**
 * Retrieves a single coupon by ID for edit/modal.
 */
export const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await adminCouponService.getCouponById(id);
        return res.json({ success: true, coupon });
    } catch (error) {
        console.error('Error fetching coupon by ID:', error);
        return res.status(404).json({ success: false, message: error.message || 'Coupon not found' });
    }
};

/**
 * Handles creation of a new coupon.
 */
export const createCoupon = async (req, res) => {
    try {
        const coupon = await adminCouponService.createCoupon(req.body);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(201).json({
                success: true,
                message: `Coupon '${coupon.code}' created successfully`,
                coupon
            });
        }

        res.redirect(`/admin/coupons?success=${encodeURIComponent(`Coupon '${coupon.code}' created successfully`)}`);
    } catch (error) {
        console.error('Error creating coupon:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/coupons?error=${encodeURIComponent(error.message)}`);
    }
};

/**
 * Updates an existing coupon by ID.
 */
export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await adminCouponService.updateCoupon(id, req.body);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Coupon '${updated.code}' updated successfully`,
                coupon: updated
            });
        }

        res.redirect(`/admin/coupons?success=${encodeURIComponent(`Coupon '${updated.code}' updated successfully`)}`);
    } catch (error) {
        console.error('Error updating coupon:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/coupons?error=${encodeURIComponent(error.message)}`);
    }
};

/**
 * Toggles a coupon's active status.
 */
export const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await adminCouponService.toggleCouponStatus(id);
        const statusText = coupon.isActive ? 'activated' : 'deactivated';

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Coupon '${coupon.code}' ${statusText} successfully`,
                isActive: coupon.isActive
            });
        }

        res.redirect(`/admin/coupons?success=${encodeURIComponent(`Coupon '${coupon.code}' ${statusText}`)}`);
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/coupons?error=${encodeURIComponent(error.message)}`);
    }
};

/**
 * Deletes a coupon by ID.
 */
export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await adminCouponService.deleteCoupon(id);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Coupon '${deleted.code}' deleted successfully`
            });
        }

        res.redirect(`/admin/coupons?success=${encodeURIComponent(`Coupon '${deleted.code}' deleted`)}`);
    } catch (error) {
        console.error('Error deleting coupon:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/coupons?error=${encodeURIComponent(error.message)}`);
    }
};
