import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import { getCartDetails } from './cartService.js';

export const placeOrder = async (userId, paymentMethod, addressId) => {
    // 1. Get cart details and totals
    const cartDetails = await getCartDetails(userId);
    if (!cartDetails.cart || cartDetails.cart.items.length === 0) {
        throw new Error('Your cart is empty.');
    }
    if (cartDetails.hasUnavailableProduct) {
        throw new Error('Your cart contains unavailable products. Please remove them before checking out.');
    }

    // 2. Retrieve user and delivery address
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found.');
    }
    if (paymentMethod === 'PixelWallet') {
        const balance = user.walletBalance || 0;
        if (balance < cartDetails.grandTotal) {
            throw new Error(`Insufficient PixelWallet balance. You need ₹${(cartDetails.grandTotal / 100).toFixed(2)} but only have ₹${(balance / 100).toFixed(2)}.`);
        }
        user.walletBalance = balance - cartDetails.grandTotal;
        await user.save();
    }
    const address = user.addresses.id(addressId);
    if (!address) {
        throw new Error('Invalid delivery address selected.');
    }

    // 3. Map order items
    const orderItems = cartDetails.cart.items.map(item => {
        if (!item.product) {
            throw new Error('Product not found in cart.');
        }
        return {
            product: item.product._id,
            platform: item.platform,
            quantity: item.quantity,
            price: item.product.price // discounted price calculated by getCartDetails
        };
    });

    // 4. Validate and decrement stock
    for (let item of cartDetails.cart.items) {
        if (item.product) {
            const product = await Product.findById(item.product._id);
            if (!product) {
                throw new Error(`Product ${item.product.title} not found.`);
            }
            
            // Check stock availability
            let availableStock = product.stock;
            if (product.platform_stock && product.platform_stock.length > 0) {
                const ps = product.platform_stock.find(p => p.platform === item.platform);
                if (ps) {
                    availableStock = ps.stock;
                }
            }

            if (availableStock < item.quantity) {
                throw new Error(`Insufficient stock for ${product.title} on ${item.platform.toUpperCase()}. Only ${availableStock} left.`);
            }

            // Decrement global stock
            product.stock = Math.max(0, product.stock - item.quantity);
            
            // Decrement platform stock
            if (product.platform_stock && product.platform_stock.length > 0) {
                const ps = product.platform_stock.find(p => p.platform === item.platform);
                if (ps) {
                    ps.stock = Math.max(0, ps.stock - item.quantity);
                }
            }
            await product.save();
        }
    }

    // 5. Generate unique orderId
    const orderId = `PX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 6. Create Order
    const order = new Order({
        userId,
        orderId,
        items: orderItems,
        deliveryAddress: {
            fullName: address.fullName,
            phone: address.phone,
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            city: address.city,
            state: address.state,
            postal_code: address.postal_code,
            country: address.country
        },
        paymentMethod,
        paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid',
        orderStatus: 'Processing',
        subtotal: cartDetails.subtotal,
        tax: cartDetails.tax,
        shipping: cartDetails.shipping,
        discount: cartDetails.discount,
        finalAmount: cartDetails.grandTotal
    });

    await order.save();

    // 7. Clear user's cart
    await Cart.deleteOne({ userId });

    return order;
};

export const getOrderById = async (orderId) => {
    return await Order.findById(orderId).populate('items.product').lean();
};

export const getOrdersByUserPaginated = async (userId, page = 1, limit = 5, sort = 'newest', filterStatus = 'All', viewType = 'orders') => {
    const skip = (page - 1) * limit;
    let sortObject = { createdAt: -1 };
    if (sort === 'oldest') {
        sortObject = { createdAt: 1 };
    } else if (sort === 'price_desc' || sort === 'amount_desc') {
        sortObject = { finalAmount: -1 };
    } else if (sort === 'price_asc' || sort === 'amount_asc') {
        sortObject = { finalAmount: 1 };
    }

    if (viewType === 'items') {
        // Fetch all matching orders sorted
        const orders = await Order.find({ userId })
            .sort(sortObject)
            .populate('items.product')
            .lean();
        
        // Flatten to items
        const items = [];
        orders.forEach(order => {
            order.items.forEach(item => {
                const rawStatus = item.status || (order.orderStatus === 'Cancelled' ? 'Cancelled' : 'Ordered');
                const itemStatus = rawStatus === 'Ordered' ? (order.orderStatus || 'Processing') : rawStatus;
                if (filterStatus === 'All' || (itemStatus && itemStatus.toUpperCase() === filterStatus.toUpperCase())) {
                    items.push({
                        ...item,
                        orderId: order.orderId,
                        orderDbId: order._id,
                        createdAt: order.createdAt,
                        paymentMethod: order.paymentMethod,
                        status: itemStatus
                    });
                }
            });
        });

        // Paginate items
        const totalCount = items.length;
        const totalPages = Math.ceil(totalCount / limit) || 1;
        const paginatedItems = items.slice(skip, skip + limit);

        return { items: paginatedItems, totalPages, currentPage: page, viewType };
    } else {
        const query = { userId };
        if (filterStatus && filterStatus !== 'All') {
            query.orderStatus = filterStatus;
        }

        const totalCount = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit) || 1;

        const orders = await Order.find(query)
            .sort(sortObject)
            .skip(skip)
            .limit(limit)
            .populate('items.product')
            .lean();
        return { orders, totalPages, currentPage: page, viewType };
    }
};


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

    return {
        totalRevenue,
        pendingShipments,
        completedProvisioning
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

    if (oldStatus !== 'Cancelled' && status === 'Cancelled') {
        order.cancellationDate = new Date();
        order.cancellationReason = 'Cancelled by Admin';
        order.cancellationComments = 'Order status updated to Cancelled by administrator.';

        if (order.paymentMethod !== 'COD') {
            const user = await User.findById(order.userId);
            if (user) {
                user.walletBalance = (user.walletBalance || 0) + order.finalAmount;
                await user.save();
            }
        }

        for (const item of order.items) {
            if (item.status !== 'Cancelled' && item.status !== 'Returned' && item.status !== 'Return Requested') {
                item.status = 'Cancelled';
                item.cancellationDate = new Date();
                item.cancellationReason = 'Cancelled by Admin';
                item.cancellationComments = 'Order status updated to Cancelled by administrator.';

                const product = await Product.findById(item.product);
                if (product) {
                    product.stock = (product.stock || 0) + item.quantity;
                    if (product.platform_stock && product.platform_stock.length > 0) {
                        const ps = product.platform_stock.find(p => p.platform === item.platform);
                        if (ps) {
                            ps.stock = (ps.stock || 0) + item.quantity;
                        }
                    }
                    await product.save();
                }
            }
        }
    }

    await order.save();
    return order;
};

export const getOrderDetailsAdmin = async (id) => {
    const order = await Order.findById(id).populate('items.product').populate('userId').lean();
    if (!order) return null;
    const lifetimeOrdersCount = await Order.countDocuments({ userId: order.userId ? order.userId._id : null });
    return { order, lifetimeOrdersCount };
};

export const cancelOrder = async (orderId, userId, reason, comments) => {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.orderStatus === 'Cancelled') {
        throw new Error('Order is already cancelled');
    }

    if (order.orderStatus !== 'Processing' && order.orderStatus !== 'Pending') {
        throw new Error('Order cannot be cancelled at this stage');
    }

    order.orderStatus = 'Cancelled';
    order.cancellationDate = new Date();
    order.cancellationReason = reason;
    order.cancellationComments = comments;

    if (order.paymentMethod !== 'COD') {
        const user = await User.findById(order.userId);
        if (user) {
            user.walletBalance = (user.walletBalance || 0) + order.finalAmount;
            await user.save();
        }
    }

    for (const item of order.items) {
        if (item.status !== 'Cancelled') {
            item.status = 'Cancelled';
            item.cancellationDate = new Date();
            item.cancellationReason = reason;
            item.cancellationComments = comments;

            const product = await Product.findById(item.product);
            if (product) {
                product.stock = (product.stock || 0) + item.quantity;
                if (product.platform_stock && product.platform_stock.length > 0) {
                    const ps = product.platform_stock.find(p => p.platform === item.platform);
                    if (ps) {
                        ps.stock = (ps.stock || 0) + item.quantity;
                    }
                }
                await product.save();
            }
        }
    }

    await order.save();
    return order;
};

export const cancelItem = async (orderId, userId, productId, reason, comments, cancelQty = 1, platform = null) => {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.orderStatus === 'Cancelled') {
        throw new Error('Order is already cancelled');
    }

    if (order.orderStatus !== 'Processing' && order.orderStatus !== 'Pending') {
        throw new Error('Order cannot be cancelled at this stage');
    }

    const item = order.items.find(i => {
        const itemProdId = i.product && i.product._id ? i.product._id.toString() : i.product.toString();
        return itemProdId === productId.toString() && (!platform || i.platform === platform) && i.status !== 'Cancelled';
    });
    if (!item) {
        throw new Error('Item not found in this order');
    }

    const qtyToCancel = Math.min(cancelQty, item.quantity);
    if (qtyToCancel <= 0) {
        throw new Error('Invalid cancellation quantity');
    }

    let targetItem;
    if (qtyToCancel < item.quantity) {
        // Split the item
        item.quantity -= qtyToCancel;

        const newItem = {
            product: item.product,
            platform: item.platform,
            quantity: qtyToCancel,
            price: item.price,
            status: 'Cancelled',
            cancellationDate: new Date(),
            cancellationReason: reason,
            cancellationComments: comments
        };
        order.items.push(newItem);
        targetItem = order.items[order.items.length - 1];
    } else {
        item.status = 'Cancelled';
        item.cancellationDate = new Date();
        item.cancellationReason = reason;
        item.cancellationComments = comments;
        targetItem = item;
    }

    const product = await Product.findById(targetItem.product);
    if (product) {
        product.stock = (product.stock || 0) + qtyToCancel;
        if (product.platform_stock && product.platform_stock.length > 0) {
            const ps = product.platform_stock.find(p => p.platform === targetItem.platform);
            if (ps) {
                ps.stock = (ps.stock || 0) + qtyToCancel;
            }
        }
        await product.save();
    }

    if (order.paymentMethod !== 'COD') {
        const user = await User.findById(order.userId);
        if (user) {
            const refundAmount = targetItem.price * qtyToCancel;
            user.walletBalance = (user.walletBalance || 0) + refundAmount;
            await user.save();
        }
    }

    const allCancelled = order.items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
        order.orderStatus = 'Cancelled';
        order.cancellationDate = new Date();
        order.cancellationReason = 'All items cancelled';
        order.cancellationComments = 'Cancelled because all items were individually cancelled.';

        if (order.paymentMethod !== 'COD') {
            const user = await User.findById(order.userId);
            if (user) {
                user.walletBalance = (user.walletBalance || 0) + (order.shipping || 0);
                await user.save();
            }
        }
    }

    await order.save();
    return order;
};

export const requestItemReturn = async (orderId, userId, productId, reason, comments, returnQty = 1, platform = null) => {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.orderStatus !== 'Delivered' && order.orderStatus !== 'Return Requested' && order.orderStatus !== 'Returned') {
        throw new Error('Only delivered orders can be returned');
    }

    const item = order.items.find(i => {
        const itemProdId = i.product && i.product._id ? i.product._id.toString() : i.product.toString();
        return itemProdId === productId.toString() && (!platform || i.platform === platform) && (i.status === 'Ordered' || !i.status);
    });
    if (!item) {
        throw new Error('Item not found or already returned/cancelled');
    }

    const qtyToReturn = Math.min(returnQty, item.quantity);
    if (qtyToReturn <= 0) {
        throw new Error('Invalid return quantity');
    }

    if (qtyToReturn < item.quantity) {
        // Split the item
        item.quantity -= qtyToReturn;

        const newItem = {
            product: item.product,
            platform: item.platform,
            quantity: qtyToReturn,
            price: item.price,
            status: 'Return Requested',
            returnDate: new Date(),
            returnReason: reason,
            returnComments: comments
        };
        order.items.push(newItem);
    } else {
        item.status = 'Return Requested';
        item.returnDate = new Date();
        item.returnReason = reason;
        item.returnComments = comments;
    }

    order.orderStatus = 'Return Requested';
    await order.save();
    return order;
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

    const user = await User.findById(order.userId);
    if (user) {
        const refundAmount = item.price * item.quantity;
        user.walletBalance = (user.walletBalance || 0) + refundAmount;
        await user.save();
    }

    const product = await Product.findById(item.product && item.product._id ? item.product._id : item.product);
    if (product) {
        product.stock = (product.stock || 0) + item.quantity;
        if (product.platform_stock && product.platform_stock.length > 0) {
            const ps = product.platform_stock.find(p => p.platform === item.platform);
            if (ps) {
                ps.stock = (ps.stock || 0) + item.quantity;
            }
        }
        await product.save();
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
    return order;
};




