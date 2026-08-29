import * as adminOfferService from '../../services/admin/offerService.js';

/**
 * Renders the Admin Offer Management page or returns offers list JSON.
 */
export const getOffersPage = async (req, res) => {
    try {
        const search = req.query.search || '';
        const targetTypeFilter = req.query.targetType || 'all';
        const statusFilter = req.query.status || 'all';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const [offersData, targetOptions] = await Promise.all([
            adminOfferService.getAdminOffers(search, targetTypeFilter, statusFilter, page, limit),
            adminOfferService.getOfferTargetOptions()
        ]);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, ...offersData, ...targetOptions });
        }

        res.render('admin/listed-offers', {
            currentTab: 'offers',
            activeTab: 'offers',
            search,
            targetTypeFilter,
            statusFilter,
            ...offersData,
            ...targetOptions,
            title: 'Offer Management · Admin Panel',
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('Error in getOffersPage:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to load offers' });
        }
        res.status(500).render('admin/listed-offers', {
            currentTab: 'offers',
            activeTab: 'offers',
            search: '',
            targetTypeFilter: 'all',
            statusFilter: 'all',
            offers: [],
            totalCount: 0,
            totalPages: 1,
            currentPage: 1,
            totalOffersCount: 0,
            activeOffersCount: 0,
            expiredOffersCount: 0,
            categories: [],
            products: [],
            publishers: [],
            title: 'Offer Management · Admin Panel',
            error: error.message || 'Failed to load offers',
            success: null
        });
    }
};

/**
 * Retrieves target choices (categories, products, publishers) as JSON for form dropdowns.
 */
export const getTargetOptions = async (req, res) => {
    try {
        const options = await adminOfferService.getOfferTargetOptions();
        return res.json({ success: true, ...options });
    } catch (error) {
        console.error('Error fetching target options:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to load target options' });
    }
};

/**
 * Retrieves a single offer by ID for editing.
 */
export const getOfferById = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await adminOfferService.getOfferById(id);
        return res.json({ success: true, offer });
    } catch (error) {
        console.error('Error fetching offer by ID:', error);
        return res.status(404).json({ success: false, message: error.message || 'Offer not found' });
    }
};

/**
 * Handles creation of a new offer.
 */
export const createOffer = async (req, res) => {
    try {
        const offer = await adminOfferService.createOffer(req.body);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(201).json({
                success: true,
                message: `Offer '${offer.title}' created successfully`,
                offer
            });
        }

        res.redirect(`/admin/offers?success=${encodeURIComponent(`Offer '${offer.title}' created successfully`)}`);
    } catch (error) {
        console.error('Error creating offer:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/offers?error=${encodeURIComponent(error.message)}`);
    }
};

/**
 * Updates an existing offer by ID.
 */
export const updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await adminOfferService.updateOffer(id, req.body);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Offer '${updated.title}' updated successfully`,
                offer: updated
            });
        }

        res.redirect(`/admin/offers?success=${encodeURIComponent(`Offer '${updated.title}' updated successfully`)}`);
    } catch (error) {
        console.error('Error updating offer:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/offers?error=${encodeURIComponent(error.message)}`);
    }
};

/**
 * Toggles an offer's active status.
 */
export const toggleOfferStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await adminOfferService.toggleOfferStatus(id);
        const statusText = offer.isActive ? 'activated' : 'deactivated';

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Offer '${offer.title}' ${statusText} successfully`,
                isActive: offer.isActive
            });
        }

        res.redirect(`/admin/offers?success=${encodeURIComponent(`Offer '${offer.title}' ${statusText}`)}`);
    } catch (error) {
        console.error('Error toggling offer status:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/offers?error=${encodeURIComponent(error.message)}`);
    }
};

/**
 * Deletes an offer by ID.
 */
export const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await adminOfferService.deleteOffer(id);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: `Offer '${deleted.title}' deleted successfully`
            });
        }

        res.redirect(`/admin/offers?success=${encodeURIComponent(`Offer '${deleted.title}' deleted`)}`);
    } catch (error) {
        console.error('Error deleting offer:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.redirect(`/admin/offers?error=${encodeURIComponent(error.message)}`);
    }
};
