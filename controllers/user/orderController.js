import * as orderService from '../../services/user/orderService.js';
import * as userService from '../../services/user/userService.js';
import * as cartService from '../../services/user/cartService.js';
import * as invoiceService from '../../services/user/invoiceService.js';

export const postPlaceOrder = async (req, res) => {
    try {
        const { paymentMethod, addressId, couponCode } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!paymentMethod || !addressId) {
            return res.status(400).json({ success: false, message: 'Payment method and address are required.' });
        }

        const effectiveCouponCode = couponCode || req.session.appliedCouponCode || null;
        const order = await orderService.placeOrder(userId, paymentMethod, addressId, effectiveCouponCode);
        
        // Clear coupon session state after order is completed
        delete req.session.appliedCouponCode;
        delete req.session.couponRemoved;

        res.status(201).json({
            success: true,
            message: 'Order placed successfully.',
            orderId: order._id
        });
    } catch (error) {
        console.error('[postPlaceOrder] Error:', error);
        const isCouponErr = (error.message || '').toLowerCase().includes('coupon') || (error.message || '').toLowerCase().includes('expired');
        if (isCouponErr) {
            delete req.session.appliedCouponCode;
            req.session.couponRemoved = true;
        }
        res.status(400).json({ success: false, message: error.message, isCouponExpired: isCouponErr });
    }
};

export const createRazorpayOrder = async (req, res) => {
    try {
        const { addressId, couponCode } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Delivery address is required.' });
        }

        const effectiveCouponCode = couponCode || req.session.appliedCouponCode || null;
        const data = await orderService.createRazorpayPaymentOrder(userId, addressId, effectiveCouponCode);

        res.status(200).json({
            success: true,
            ...data
        });
    } catch (error) {
        console.error('[createRazorpayOrder] Error:', error);
        const isCouponErr = (error.message || '').toLowerCase().includes('coupon') || (error.message || '').toLowerCase().includes('expired');
        if (isCouponErr) {
            delete req.session.appliedCouponCode;
            req.session.couponRemoved = true;
        }
        res.status(400).json({ success: false, message: error.message, isCouponExpired: isCouponErr });
    }
};

export const verifyRazorpayPayment = async (req, res) => {
    try {
        const { addressId, couponCode, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!addressId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment parameters.' });
        }

        const effectiveCouponCode = couponCode || req.session.appliedCouponCode || null;
        const order = await orderService.verifyAndCompleteRazorpayOrder(
            userId,
            addressId,
            effectiveCouponCode,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        // Clear coupon session state after order is completed
        delete req.session.appliedCouponCode;
        delete req.session.couponRemoved;

        res.status(201).json({
            success: true,
            message: 'Payment verified and order placed successfully.',
            orderId: order._id
        });
    } catch (error) {
        console.error('[verifyRazorpayPayment] Error:', error);
        const isCouponErr = (error.message || '').toLowerCase().includes('coupon') || (error.message || '').toLowerCase().includes('expired');
        if (isCouponErr) {
            delete req.session.appliedCouponCode;
            req.session.couponRemoved = true;
        }
        res.status(400).json({ success: false, message: error.message, isCouponExpired: isCouponErr });
    }
};

export const getOrderFailure = async (req, res) => {
    try {
        const { orderId } = req.params;
        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);

        const order = await orderService.getOrderById(orderId);
        if (!order || order.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/home');
        }

        if (order.paymentStatus === 'Paid') {
            return res.redirect(`/orders/success/${order._id}`);
        }

        const walletBalance = await (await import('../../services/shared/walletHelper.js')).getWalletBalance(loggedInUserId);
        const cartCount = await cartService.getCartItemCount(loggedInUserId);

        const reason = req.query.reason || 'Payment transaction failed or authorization was cancelled.';

        res.render('user/order-failure', {
            order,
            user,
            walletBalance,
            cartCount,
            reason
        });
    } catch (error) {
        console.error('[getOrderFailure] Error:', error);
        res.redirect('/home');
    }
};

export const retryRazorpayOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required.' });
        }

        const data = await orderService.retryRazorpayOrder(orderId, userId);

        res.status(200).json({
            success: true,
            ...data
        });
    } catch (error) {
        console.error('[retryRazorpayOrder] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const changePaymentMethod = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { paymentMethod } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: 'Payment method is required.' });
        }

        const order = await orderService.changeOrderPaymentMethod(orderId, userId, paymentMethod);

        delete req.session.appliedCouponCode;
        delete req.session.couponRemoved;

        res.status(200).json({
            success: true,
            message: `Payment method changed to ${paymentMethod}. Order completed successfully!`,
            orderId: order._id
        });
    } catch (error) {
        console.error('[changePaymentMethod] Error:', error);
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
            return res.status(404).render('404', {
                title: '404 - Order Not Found | PixelPlay',
                isAdminContext: false,
                url: req.originalUrl
            });
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
            tax_rate: dbOrder.gst_rate,
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
        return res.status(404).render('404', {
            title: '404 - Page Not Found | PixelPlay',
            isAdminContext: false,
            url: req.originalUrl
        });
    }
};

export const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/login');

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
            return res.redirect('/orders');
        }

        if (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending') {
            return res.redirect(`/orders/${orderId}`);
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
        res.redirect('/orders');
    }
};

export const postCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cancel_reason, additional_comments } = req.body;

        if (!cancel_reason) {
            return res.redirect(`/orders/${orderId}/cancellation?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/orders/${orderId}/cancellation?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/orders/${orderId}/cancellation?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelOrder(orderId, loggedInUserId, cancel_reason, additional_comments);

        res.redirect(`/orders/${orderId}?notification=Order cancelled successfully`);
    } catch (error) {
        console.error('[postCancelOrder] Error:', error);
        res.redirect('/orders');
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
            return res.redirect('/orders');
        }

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform));
        if (!item) {
            return res.redirect(`/orders/${orderId}`);
        }

        if (item.status === 'Cancelled' || (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending')) {
            return res.redirect(`/orders/${orderId}`);
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
        res.redirect('/orders');
    }
};

export const postCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { cancel_reason, additional_comments, quantity } = req.body;
        const cancelQty = parseInt(quantity, 10) || 1;

        if (!cancel_reason) {
            return res.redirect(`/orders/${orderId}/items/${productId}/cancellation?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/orders/${orderId}/items/${productId}/cancellation?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/orders/${orderId}/items/${productId}/cancellation?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelItem(orderId, loggedInUserId, productId, cancel_reason, additional_comments, cancelQty, platform);

        res.redirect(`/orders/${orderId}?notification=Item cancelled successfully`);
    } catch (error) {
        console.error('[postCancelItem] Error:', error);
        res.redirect('/orders');
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
            return res.redirect('/orders');
        }

        if (dbOrder.orderStatus !== 'Delivered' && dbOrder.orderStatus !== 'Return Requested' && dbOrder.orderStatus !== 'Returned') {
            return res.redirect(`/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform) && (i.status === 'Ordered' || !i.status));
        if (!item) {
            return res.redirect(`/orders/${orderId}`);
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
        res.redirect('/orders');
    }
};

export const postReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { return_reason, additional_details, quantity } = req.body;
        const returnQty = parseInt(quantity, 10) || 1;

        if (!return_reason) {
            return res.redirect(`/orders/${orderId}/items/${productId}/returns?error=Return reason is required`);
        }
        if (return_reason === 'other' && (!additional_details || additional_details.trim().length < 10)) {
            return res.redirect(`/orders/${orderId}/items/${productId}/returns?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_details && additional_details.trim().length > 100) {
            return res.redirect(`/orders/${orderId}/items/${productId}/returns?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.requestItemReturn(orderId, loggedInUserId, productId, return_reason, additional_details, returnQty, platform);

        res.redirect(`/orders/${orderId}?notification=Return requested successfully`);
    } catch (error) {
        console.error('[postReturnOrder] Error:', error);
        res.redirect('/orders');
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
            res.redirect('/orders');
        } else {
            res.redirect(`/orders/${orderId}?error=${encodeURIComponent(error.message)}`);
        }
    }
};

export const getEntireOrderReturn = async (req, res) => {
    try {
        const { orderId } = req.params;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/orders');
        }

        if (dbOrder.orderStatus !== 'Delivered' && dbOrder.orderStatus !== 'Return Requested' && dbOrder.orderStatus !== 'Returned') {
            return res.redirect(`/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

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
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items
        };

        const returnableItems = (dbOrder.items || []).filter(i => i.status === 'Ordered' || !i.status);
        let selectedProduct = null;
        let selectedItem = null;

        if (returnableItems.length === 1) {
            selectedItem = returnableItems[0];
            selectedProduct = selectedItem.product;
        }

        res.render('user/order-return', {
            order: mappedOrder,
            product: selectedProduct,
            item: selectedItem,
            user,
            cartCount,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('[getEntireOrderReturn] Error:', error);
        res.redirect('/orders');
    }
};

export const postEntireOrderReturn = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { return_reason, additional_details } = req.body;

        if (!return_reason) {
            return res.redirect(`/orders/${orderId}/returns?error=Return reason is required`);
        }
        if (return_reason === 'other' && (!additional_details || additional_details.trim().length < 10)) {
            return res.redirect(`/orders/${orderId}/returns?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_details && additional_details.trim().length > 100) {
            return res.redirect(`/orders/${orderId}/returns?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.requestOrderReturn(orderId, loggedInUserId, return_reason, additional_details);

        res.redirect(`/orders/${orderId}?notification=Return requested successfully for the order`);
    } catch (error) {
        console.error('[postEntireOrderReturn] Error:', error);
        res.redirect('/orders');
    }
};
