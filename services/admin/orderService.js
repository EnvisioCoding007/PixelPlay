import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Product from '../../models/Product.js';
import { addTransaction } from '../shared/walletHelper.js';
import { calculateItemRefundAmount } from '../shared/orderHelper.js';
import { createNotificationForUser, checkAndNotifyRestock } from '../shared/notificationHelper.js';

export const getAllOrdersAdminPaginated = async (search = '', status = '', paymentMethod = '', sort = 'newest', page = 1, limit = 10) => {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (status && status !== 'All') {
        filter.orderStatus = status;
    }

    if (paymentMethod && paymentMethod !== 'All') {
        filter.paymentMethod = paymentMethod;
    }

    if (search && search.trim()) {
        const searchStr = search.trim();
        const users = await User.find({ email: { $regex: searchStr, $options: 'i' } }).select('_id');
        const userIds = users.map(u => u._id);
        
        filter.$or = [
            { orderId: { $regex: searchStr, $options: 'i' } },
            { userId: { $in: userIds } }
        ];
    }

    let sortConfig = { createdAt: -1 };
    if (sort === 'oldest') {
        sortConfig = { createdAt: 1 };
    } else if (sort === 'amount_desc') {
        sortConfig = { finalAmount: -1 };
    } else if (sort === 'amount_asc') {
        sortConfig = { finalAmount: 1 };
    }

    const [orders, totalCount] = await Promise.all([
        Order.find(filter)
            .sort(sortConfig)
            .skip(skip)
            .limit(limitNum)
            .populate('userId')
            .populate('items.product')
            .lean(),
        Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return { orders, totalCount, totalPages, currentPage: pageNum };
};

export const getAdminOrderStats = async () => {
    const revenueResult = await Order.aggregate([
        { $match: { orderStatus: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    const pendingShipments = await Order.countDocuments({ orderStatus: 'Processing' });
    const completedProvisioning = await Order.countDocuments({ orderStatus: 'Delivered' });
    const pendingReturns = await Order.countDocuments({ orderStatus: 'Return Requested' });

    return {
        totalRevenue,
        pendingShipments,
        completedProvisioning,
        pendingReturns
    };
};

export const updateOrderStatus = async (id, status) => {
    const order = await Order.findById(id);
    if (!order) {
        throw new Error('Order not found');
    }

    if (['Cancelled', 'Returned', 'Return Requested'].includes(status)) {
        throw new Error('This status can only be initiated from the user side');
    }

    const oldStatus = order.orderStatus;
    if (oldStatus === 'Cancelled') {
        throw new Error('Cannot change the status of a cancelled order');
    }
    if (oldStatus === 'Returned' || oldStatus === 'Return Requested') {
        throw new Error('Cannot change the status of a returned or return requested order');
    }
    if (oldStatus === 'Delivered') {
        throw new Error('Cannot change the status of a delivered order');
    }
    if (oldStatus === 'Shipped' && status === 'Processing') {
        throw new Error('Cannot revert status from Shipped back to Processing');
    }

    order.orderStatus = status;

    if (status === 'Delivered') {
        order.paymentStatus = 'Paid';
    }

    await order.save();

    createNotificationForUser(order.userId, {
        type: 'order_status',
        title: 'Order Status Updated',
        message: `Your order #${order.orderId} status is now "${status}".`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, orderDbId: order._id, status }
    }).catch(err => console.error('[updateOrderStatus Notification Error]', err));

    return order;
};

export const getOrderDetailsAdmin = async (id) => {
    const order = await Order.findById(id).populate('items.product').populate('userId').lean();
    if (!order) return null;
    const lifetimeOrdersCount = await Order.countDocuments({ userId: order.userId ? order.userId._id : null });
    return { order, lifetimeOrdersCount };
};

export const approveItemReturn = async (orderId, productId, adminComment, platform = null) => {
    const order = await Order.findById(orderId);
    if (!order) {
        throw new Error('Order not found');
    }

    const item = order.items.find(i => {
        const itemProdId = i.product && i.product._id ? i.product._id.toString() : i.product.toString();
        return itemProdId === productId.toString() && (!platform || i.platform === platform) && i.status === 'Return Requested';
    });
    if (!item) {
        throw new Error('Return request not found for this item');
    }

    item.status = 'Returned';
    item.adminReturnComment = adminComment;

    let itemGstRate = item.gst_rate;
    if (typeof itemGstRate !== 'number') {
        const prod = await Product.findById(item.product && item.product._id ? item.product._id : item.product);
        itemGstRate = (prod && prod.gst_rate) ? prod.gst_rate : 18;
    }
    const refundAmount = calculateItemRefundAmount(order, item, item.quantity, itemGstRate);
    
    if (refundAmount > 0) {
        await addTransaction(order.userId, {
            amount: refundAmount,
            type: 'credit',
            orderId: order.orderId,
            description: `Refund for Approved Return of Item in Order #${order.orderId}`,
            status: 'Success'
        });
    }

    const product = await Product.findById(item.product && item.product._id ? item.product._id : item.product);
    if (product) {
        const oldStock = product.stock || 0;
        product.stock = (product.stock || 0) + item.quantity;
        if (product.platform_stock && product.platform_stock.length > 0) {
            const ps = product.platform_stock.find(p => p.platform === item.platform);
            if (ps) {
                ps.stock = (ps.stock || 0) + item.quantity;
            }
        }
        await product.save();

        if (oldStock === 0 && product.stock > 0) {
            checkAndNotifyRestock(product._id, product.title).catch(err => console.error('[approveItemReturn Restock Notification Error]', err));
        }
    }

    const allCancelledOrReturned = order.items.every(i => i.status === 'Cancelled' || i.status === 'Returned');
    if (allCancelledOrReturned) {
        order.orderStatus = 'Returned';
    } else {
        const hasPendingReturns = order.items.some(i => i.status === 'Return Requested');
        if (!hasPendingReturns) {
            order.orderStatus = 'Delivered';
        }
    }

    await order.save();

    createNotificationForUser(order.userId, {
        type: 'order_status',
        title: 'Return Request Approved',
        message: `Return request for item in Order #${order.orderId} has been approved.`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, productId }
    }).catch(err => console.error('[approveItemReturn Notification Error]', err));

    return order;
};

export const rejectItemReturn = async (orderId, productId, adminComment, platform = null) => {
    const order = await Order.findById(orderId);
    if (!order) {
        throw new Error('Order not found');
    }

    const item = order.items.find(i => {
        const itemProdId = i.product && i.product._id ? i.product._id.toString() : i.product.toString();
        return itemProdId === productId.toString() && (!platform || i.platform === platform) && i.status === 'Return Requested';
    });
    if (!item) {
        throw new Error('Return request not found for this item');
    }

    item.status = 'Ordered';
    item.adminReturnComment = adminComment;

    const hasPendingReturns = order.items.some(i => i.status === 'Return Requested');
    if (!hasPendingReturns) {
        order.orderStatus = 'Delivered';
    }

    await order.save();

    createNotificationForUser(order.userId, {
        type: 'order_status',
        title: 'Return Request Rejected',
        message: `Return request for item in Order #${order.orderId} was updated: ${adminComment || 'Rejected'}.`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, productId }
    }).catch(err => console.error('[rejectItemReturn Notification Error]', err));

    return order;
};

