import * as orderService from '../../services/orderService.js';
import * as userService from '../../services/userService.js';
import * as cartService from '../../services/cartService.js';
import * as invoiceService from '../../services/invoiceService.js';

export const postPlaceOrder = async (req, res) => {
    try {
        const { paymentMethod, addressId } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!paymentMethod || !addressId) {
            return res.status(400).json({ success: false, message: 'Payment method and address are required.' });
        }

        const order = await orderService.placeOrder(userId, paymentMethod, addressId);
        
        res.status(201).json({
            success: true,
            message: 'Order placed successfully.',
            orderId: order._id
        });
    } catch (error) {
        console.error('[postPlaceOrder] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await orderService.getOrderById(orderId);
        
        const loggedInUserId = req.session.user.id || req.session.user;
        if (!order || order.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/home');
        }

        res.render('user/order-success', { order });
    } catch (error) {
        console.error('[getOrderSuccess] Error:', error);
        res.redirect('/home');
    }
};

export const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/home');
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

        let mappedStatus = dbOrder.orderStatus || 'Processing';
        if (mappedStatus.toUpperCase() === 'PENDING') {
            mappedStatus = 'Processing';
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: mappedStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items,
            cancellationDate: dbOrder.cancellationDate,
            cancellationReason: dbOrder.cancellationReason,
            cancellationComments: dbOrder.cancellationComments
        };

        res.render('user/order-details', { order: mappedOrder, user, cartCount });
    } catch (error) {
        console.error('[getOrderDetails] Error:', error);
        res.redirect('/home');
    }
};

export const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const limit = 5;
        const page = parseInt(req.query.page) || 1;
        const sort = req.query.sort || 'newest';
        const filter = req.query.filter || 'All';
        const viewType = req.query.viewType || 'orders';

        const result = await orderService.getOrdersByUserPaginated(userId, page, limit, sort, filter, viewType);
        const { totalPages, currentPage } = result;

        const cartCount = await cartService.getCartItemCount(userId);

        let mappedOrders = [];
        let paginatedItems = [];

        if (viewType === 'items') {
            paginatedItems = result.items;
        } else {
            mappedOrders = result.orders.map(order => {
                let mappedStatus = order.orderStatus || 'Processing';
                if (mappedStatus.toUpperCase() === 'PENDING') {
                    mappedStatus = 'Processing';
                }
                return {
                    ...order,
                    status: mappedStatus
                };
            });
        }

        res.render('user/order-history', {
            user,
            orders: mappedOrders,
            items: paginatedItems,
            currentPage,
            totalPages,
            sort,
            filter,
            viewType,
            cartCount
        });
    } catch (error) {
        console.error('[getOrderHistory] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading order history.'
        });
    }
};

export const getCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/user/orders');
        }

        if (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending') {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

        let mappedStatus = dbOrder.orderStatus || 'Processing';
        if (mappedStatus.toUpperCase() === 'PENDING') {
            mappedStatus = 'Processing';
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: mappedStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items
        };

        res.render('user/order-cancel', { order: mappedOrder, user, cartCount, product: null, item: null, error: req.query.error || null });
    } catch (error) {
        console.error('[getCancelOrder] Error:', error);
        res.redirect('/user/orders');
    }
};

export const postCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cancel_reason, additional_comments } = req.body;

        if (!cancel_reason) {
            return res.redirect(`/user/orders/${orderId}/cancellation?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/user/orders/${orderId}/cancellation?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/user/orders/${orderId}/cancellation?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelOrder(orderId, loggedInUserId, cancel_reason, additional_comments);

        res.redirect(`/user/orders/${orderId}?notification=Order cancelled successfully`);
    } catch (error) {
        console.error('[postCancelOrder] Error:', error);
        res.redirect('/user/orders');
    }
};

export const getCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/user/orders');
        }

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform));
        if (!item) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        if (item.status === 'Cancelled' || (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending')) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

        let mappedStatus = dbOrder.orderStatus || 'Processing';
        if (mappedStatus.toUpperCase() === 'PENDING') {
            mappedStatus = 'Processing';
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: mappedStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items
        };

        res.render('user/order-cancel', {
            order: mappedOrder,
            product: item.product,
            item: item,
            user,
            cartCount,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('[getCancelItem] Error:', error);
        res.redirect('/user/orders');
    }
};

export const postCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { cancel_reason, additional_comments, quantity } = req.body;
        const cancelQty = parseInt(quantity, 10) || 1;

        if (!cancel_reason) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/cancellation?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/cancellation?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/cancellation?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelItem(orderId, loggedInUserId, productId, cancel_reason, additional_comments, cancelQty, platform);

        res.redirect(`/user/orders/${orderId}?notification=Item cancelled successfully`);
    } catch (error) {
        console.error('[postCancelItem] Error:', error);
        res.redirect('/user/orders');
    }
};

export const getReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/user/orders');
        }

        if (dbOrder.orderStatus !== 'Delivered' && dbOrder.orderStatus !== 'Return Requested' && dbOrder.orderStatus !== 'Returned') {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform) && (i.status === 'Ordered' || !i.status));
        if (!item) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: dbOrder.orderStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount
        };

        res.render('user/order-return', {
            order: mappedOrder,
            product: item.product,
            item: item,
            user,
            cartCount,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('[getReturnOrder] Error:', error);
        res.redirect('/user/orders');
    }
};

export const postReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { return_reason, additional_details, quantity } = req.body;
        const returnQty = parseInt(quantity, 10) || 1;

        if (!return_reason) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/returns?error=Return reason is required`);
        }
        if (return_reason === 'other' && (!additional_details || additional_details.trim().length < 10)) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/returns?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_details && additional_details.trim().length > 100) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/returns?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.requestItemReturn(orderId, loggedInUserId, productId, return_reason, additional_details, returnQty, platform);

        res.redirect(`/user/orders/${orderId}?notification=Return requested successfully`);
    } catch (error) {
        console.error('[postReturnOrder] Error:', error);
        res.redirect('/user/orders');
    }
};

export const downloadInvoice = async (req, res) => {
    const { orderId } = req.params;
    try {
        const loggedInUserId = req.session.user.id || req.session.user;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${orderId}.pdf`);

        await invoiceService.generateInvoicePDF(orderId, loggedInUserId, res);
    } catch (error) {
        console.error('[downloadInvoice] Error:', error);
        if (error.message === 'Order not found' || error.message === 'Unauthorized access') {
            res.redirect('/user/orders');
        } else {
            res.redirect(`/user/orders/${orderId}?error=${encodeURIComponent(error.message)}`);
        }
    }
};
