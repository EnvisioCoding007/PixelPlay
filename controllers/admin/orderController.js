import * as orderService from '../../services/orderService.js';

export const renderOrderManagement = async (req, res) => {
    try {
        const { search = '', status = 'All', paymentMethod = 'All', sort = 'newest', page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        const [stats, orderData] = await Promise.all([
            orderService.getAdminOrderStats(),
            orderService.getAllOrdersAdminPaginated(search, status, paymentMethod, sort, pageNum, limitNum)
        ]);

        const currentFilters = {};
        if (search) currentFilters.search = search;
        if (status && status !== 'All') currentFilters.status = status;
        if (paymentMethod && paymentMethod !== 'All') currentFilters.paymentMethod = paymentMethod;
        if (sort && sort !== 'newest') currentFilters.sort = sort;

        res.render('admin/order-management', {
            stats,
            orders: orderData.orders,
            currentPage: orderData.currentPage,
            totalPages: orderData.totalPages,
            totalCount: orderData.totalCount,
            search,
            status,
            paymentMethod,
            sort,
            limit: limitNum,
            currentFilters,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderOrderManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderAdminOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await orderService.getOrderDetailsAdmin(id);
        if (!details) {
            return res.status(404).send('Order not found');
        }

        res.render('admin/order-details', {
            order: details.order,
            lifetimeOrdersCount: details.lifetimeOrdersCount,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAdminOrderDetails]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const updateAdminOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { orderStatus } = req.body;

        if (!orderStatus) {
            return res.status(400).json({ success: false, message: 'Order status is required.' });
        }

        const updatedOrder = await orderService.updateOrderStatus(id, orderStatus);

        const isAjax =
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            (req.headers['accept'] && req.headers['accept'].includes('application/json'));

        if (isAjax) {
            return res.status(200).json({
                success: true,
                message: `Order status updated to ${updatedOrder.orderStatus}.`,
                orderStatus: updatedOrder.orderStatus,
                paymentStatus: updatedOrder.paymentStatus
            });
        }

        res.redirect(`/admin/orders/${id}`);
    } catch (err) {
        console.error('[updateAdminOrderStatus]', err);
        const isAjax =
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            (req.headers['accept'] && req.headers['accept'].includes('application/json'));

        if (isAjax) {
            return res.status(500).json({ success: false, message: err.message || 'Failed to update order status.' });
        }

        res.status(500).send('Internal Server Error');
    }
};

export const handleItemReturn = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { reason, decision } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Comment/reason is required.' });
        }
        if (!decision || (decision !== 'approve' && decision !== 'reject')) {
            return res.status(400).json({ success: false, message: 'Invalid decision.' });
        }

        if (decision === 'approve') {
            await orderService.approveItemReturn(orderId, productId, reason, platform);
            return res.status(200).json({
                success: true,
                message: 'Return request approved successfully.'
            });
        } else {
            await orderService.rejectItemReturn(orderId, productId, reason, platform);
            return res.status(200).json({
                success: true,
                message: 'Return request rejected successfully.'
            });
        }
    } catch (err) {
        console.error('[handleItemReturn]', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to process return request.' });
    }
};
