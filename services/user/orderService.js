import Order from '../../models/Order.js';
import Cart from '../../models/Cart.js';
import User from '../../models/User.js';
import Product from '../../models/Product.js';
import { getCartDetails } from './cartService.js';
import { processWalletPayment, processWalletRefund } from './walletService.js';
import { getWalletBalance } from '../shared/walletHelper.js';
import { recordCouponUsage } from '../shared/couponHelper.js';
import { createRazorpayOrder, verifyRazorpaySignature, getRazorpayKeyId } from '../shared/razorpayHelper.js';
import { calculateItemRefundAmount, processReferralRewardsOnFirstOrder } from '../shared/orderHelper.js';
import { createNotificationForUser, checkAndNotifyRestock, checkAndNotifyLowStock } from '../shared/notificationHelper.js';

export const createRazorpayPaymentOrder = async (userId, addressId, couponCode = null) => {
    // 1. Get cart details and totals
    const cartDetails = await getCartDetails(userId, couponCode);
    if (!cartDetails.cart || cartDetails.cart.items.length === 0) {
        throw new Error('Your cart is empty.');
    }
    if (cartDetails.hasUnavailableProduct) {
        throw new Error('Your cart contains unavailable products. Please remove them before checking out.');
    }
    if (cartDetails.hasInsufficientStockProduct) {
        throw new Error('Your cart contains products with insufficient stock. Please adjust quantities before checking out.');
    }

    // 2. Retrieve user and delivery address
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found.');
    }
    const address = user.addresses.id(addressId);
    if (!address) {
        throw new Error('Invalid delivery address selected.');
    }

    // 3. Create Razorpay order via Razorpay API
    const receiptId = `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const rzpOrder = await createRazorpayOrder(cartDetails.grandTotal, receiptId);

    return {
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: getRazorpayKeyId(),
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        grandTotalRupees: (cartDetails.grandTotal / 100).toFixed(2)
    };
};

export const verifyAndCompleteRazorpayOrder = async (userId, addressId, couponCode, razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
    // 1. Verify Razorpay HMAC signature
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
        throw new Error('Razorpay payment signature verification failed.');
    }

    // 2. Retrieve cart and user
    const cartDetails = await getCartDetails(userId, couponCode);
    if (!cartDetails.cart || cartDetails.cart.items.length === 0) {
        throw new Error('Your cart is empty.');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found.');
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
            price: item.product.price,
            gst_rate: item.product.gst_rate || 18
        };
    });

    // 4. Generate unique orderId
    const orderId = `PX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Create Order document with paymentStatus: Paid
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
        paymentMethod: 'Razorpay',
        paymentStatus: 'Paid',
        orderStatus: 'Processing',
        subtotal: cartDetails.subtotal,
        tax: cartDetails.tax,
        shipping: cartDetails.shipping,
        discount: cartDetails.discount,
        couponCode: cartDetails.appliedCoupon ? cartDetails.appliedCoupon.code : null,
        finalAmount: cartDetails.grandTotal,
        transactionId: razorpayPaymentId
    });

    // 6. Decrement stock for order items
    for (let item of cartDetails.cart.items) {
        if (item.product) {
            const product = await Product.findById(item.product._id);
            if (product) {
                const oldStock = product.stock || 0;
                product.stock = Math.max(0, (product.stock || 0) - item.quantity);
                if (product.platform_stock && product.platform_stock.length > 0) {
                    const ps = product.platform_stock.find(p => p.platform === item.platform);
                    if (ps) {
                        ps.stock = Math.max(0, (ps.stock || 0) - item.quantity);
                    }
                }
                await product.save();

                if (oldStock >= 5 && product.stock < 5 && product.stock > 0) {
                    checkAndNotifyLowStock(product._id, oldStock, product.stock, product.title).catch(err => console.error('[verifyAndCompleteRazorpayOrder LowStock Error]', err));
                }
            }
        }
    }

    await order.save();

    if (cartDetails.appliedCoupon && cartDetails.appliedCoupon.id) {
        await recordCouponUsage(cartDetails.appliedCoupon.id, userId);
    }

    // Process referral reward bonus if first order
    await processReferralRewardsOnFirstOrder(userId, order._id);

    // 7. Clear user's cart
    await Cart.deleteOne({ userId });

    createNotificationForUser(userId, {
        type: 'order_status',
        title: 'Order Placed Successfully',
        message: `Your order #${order.orderId} has been placed successfully!`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, orderDbId: order._id }
    }).catch(err => console.error('[Order Created Notification Error]', err));

    return order;
};

export const retryRazorpayOrder = async (orderId, userId) => {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found.');
    }
    if (order.paymentStatus === 'Paid') {
        throw new Error('Order is already paid.');
    }

    const receiptId = `rcpt_retry_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const rzpOrder = await createRazorpayOrder(order.finalAmount, receiptId);

    order.transactionId = rzpOrder.id;
    await order.save();

    return {
        orderDbId: order._id,
        orderId: order.orderId,
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: getRazorpayKeyId(),
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        grandTotalRupees: (order.finalAmount / 100).toFixed(2)
    };
};

export const changeOrderPaymentMethod = async (orderId, userId, newPaymentMethod) => {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found.');
    }
    if (order.paymentStatus === 'Paid') {
        throw new Error('Order is already paid.');
    }

    if (newPaymentMethod === 'PixelWallet') {
        const balance = await getWalletBalance(userId);
        if (balance < order.finalAmount) {
            throw new Error(`Insufficient PixelWallet balance. You need ₹${(order.finalAmount / 100).toFixed(2)} but only have ₹${(balance / 100).toFixed(2)}.`);
        }
        await processWalletPayment(userId, order.finalAmount, order.orderId);
        order.paymentMethod = 'PixelWallet';
        order.paymentStatus = 'Paid';
    } else if (newPaymentMethod === 'COD') {
        order.paymentMethod = 'COD';
        order.paymentStatus = 'Pending';
    } else {
        throw new Error('Invalid payment method selected.');
    }

    // Decrement stock for order items
    for (let item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
            const oldStock = product.stock || 0;
            product.stock = Math.max(0, (product.stock || 0) - item.quantity);
            if (product.platform_stock && product.platform_stock.length > 0) {
                const ps = product.platform_stock.find(p => p.platform === item.platform);
                if (ps) {
                    ps.stock = Math.max(0, (ps.stock || 0) - item.quantity);
                }
            }
            await product.save();

            if (oldStock >= 5 && product.stock < 5 && product.stock > 0) {
                checkAndNotifyLowStock(product._id, oldStock, product.stock, product.title).catch(err => console.error('[changeOrderPaymentMethod LowStock Error]', err));
            }
        }
    }

    await order.save();

    if (order.couponCode) {
        const Coupon = (await import('../../models/Coupon.js')).default;
        const couponDoc = await Coupon.findOne({ code: order.couponCode });
        if (couponDoc) {
            await recordCouponUsage(couponDoc._id, userId);
        }
    }

    await Cart.deleteOne({ userId });

    return order;
};

export const placeOrder = async (userId, paymentMethod, addressId, couponCode = null) => {
    // 1. Get cart details and totals
    const cartDetails = await getCartDetails(userId, couponCode);
    if (!cartDetails.cart || cartDetails.cart.items.length === 0) {
        throw new Error('Your cart is empty.');
    }
    if (cartDetails.hasUnavailableProduct) {
        throw new Error('Your cart contains unavailable products. Please remove them before checking out.');
    }
    if (cartDetails.hasInsufficientStockProduct) {
        throw new Error('Your cart contains products with insufficient stock. Please adjust quantities before checking out.');
    }

    // 2. Retrieve user and delivery address
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found.');
    }
    if (paymentMethod === 'PixelWallet') {
        const balance = await getWalletBalance(userId);
        if (balance < cartDetails.grandTotal) {
            throw new Error(`Insufficient PixelWallet balance. You need ₹${(cartDetails.grandTotal / 100).toFixed(2)} but only have ₹${(balance / 100).toFixed(2)}.`);
        }
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
            price: item.product.price, // discounted price calculated by getCartDetails
            gst_rate: item.product.gst_rate || 18
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

            const oldStock = product.stock || 0;
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

            if (oldStock >= 5 && product.stock < 5 && product.stock > 0) {
                checkAndNotifyLowStock(product._id, oldStock, product.stock, product.title).catch(err => console.error('[placeOrder LowStock Error]', err));
            }
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
        couponCode: cartDetails.appliedCoupon ? cartDetails.appliedCoupon.code : null,
        finalAmount: cartDetails.grandTotal
    });

    await order.save();

    if (cartDetails.appliedCoupon && cartDetails.appliedCoupon.id) {
        await recordCouponUsage(cartDetails.appliedCoupon.id, userId);
    }

    if (paymentMethod === 'PixelWallet') {
        const walletResult = await processWalletPayment(userId, cartDetails.grandTotal, orderId);
        if (walletResult && walletResult.transaction) {
            order.transactionId = walletResult.transaction.transactionId || `PW-${Date.now()}`;
            await order.save();
        }
    }

    // Process referral reward bonus if first order
    await processReferralRewardsOnFirstOrder(userId, order._id);

    // 7. Clear user's cart
    await Cart.deleteOne({ userId });

    createNotificationForUser(userId, {
        type: 'order_status',
        title: 'Order Placed Successfully',
        message: `Your order #${order.orderId} has been placed successfully!`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, orderDbId: order._id }
    }).catch(err => console.error('[Order Created Notification Error]', err));

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
        // Fetch all matching orders sorted (excluding failed payments)
        const orders = await Order.find({ userId, paymentStatus: { $ne: 'Failed' } })
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
        const query = { userId, paymentStatus: { $ne: 'Failed' } };
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

export const cancelOrder = async (orderId, userId, reason, comments) => {
    if (reason && reason.length > 100) {
        throw new Error('Cancellation reason cannot exceed 100 characters.');
    }
    if (comments && comments.length > 100) {
        throw new Error('Cancellation comments cannot exceed 100 characters.');
    }

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
        await processWalletRefund(order.userId, order.finalAmount, order.orderId, `Refund for Cancelled Order #${order.orderId}`);
    }

    for (const item of order.items) {
        if (item.status !== 'Cancelled') {
            item.status = 'Cancelled';
            item.cancellationDate = new Date();
            item.cancellationReason = reason;
            item.cancellationComments = comments;

            const product = await Product.findById(item.product);
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
                    checkAndNotifyRestock(product._id, product.title).catch(err => console.error('[cancelOrder Restock Notification Error]', err));
                }
            }
        }
    }

    await order.save();

    createNotificationForUser(userId, {
        type: 'order_status',
        title: 'Order Cancelled',
        message: `Your order #${order.orderId} has been cancelled.`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, orderDbId: order._id }
    }).catch(err => console.error('[cancelOrder Notification Error]', err));

    return order;
};

export const cancelItem = async (orderId, userId, productId, reason, comments, cancelQty = 1, platform = null) => {
    if (reason && reason.length > 100) {
        throw new Error('Cancellation reason cannot exceed 100 characters.');
    }
    if (comments && comments.length > 100) {
        throw new Error('Cancellation comments cannot exceed 100 characters.');
    }

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
        const oldStock = product.stock || 0;
        product.stock = (product.stock || 0) + qtyToCancel;
        if (product.platform_stock && product.platform_stock.length > 0) {
            const ps = product.platform_stock.find(p => p.platform === targetItem.platform);
            if (ps) {
                ps.stock = (ps.stock || 0) + qtyToCancel;
            }
        }
        await product.save();

        if (oldStock === 0 && product.stock > 0) {
            checkAndNotifyRestock(product._id, product.title).catch(err => console.error('[cancelItem Restock Notification Error]', err));
        }
    }

    if (order.paymentMethod !== 'COD') {
        let itemGstRate = targetItem.gst_rate;
        if (typeof itemGstRate !== 'number') {
            const prod = await Product.findById(targetItem.product);
            itemGstRate = (prod && prod.gst_rate) ? prod.gst_rate : 18;
        }
        const refundAmount = calculateItemRefundAmount(order, targetItem, qtyToCancel, itemGstRate);
        if (refundAmount > 0) {
            await processWalletRefund(order.userId, refundAmount, order.orderId, `Refund for Cancelled Item in Order #${order.orderId}`);
        }
    }

    const allCancelled = order.items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
        order.orderStatus = 'Cancelled';
        order.cancellationDate = new Date();
        order.cancellationReason = 'All items cancelled';
        order.cancellationComments = 'Cancelled because all items were individually cancelled.';

        if (order.paymentMethod !== 'COD' && order.shipping > 0) {
            await processWalletRefund(order.userId, order.shipping, order.orderId, `Shipping Refund for Cancelled Order #${order.orderId}`);
        }
    }

    await order.save();

    createNotificationForUser(userId, {
        type: 'order_status',
        title: 'Item Cancelled',
        message: `An item in your order #${order.orderId} was cancelled.`,
        link: `/user/orders/${order._id}`,
        metadata: { orderId: order.orderId, orderDbId: order._id }
    }).catch(err => console.error('[cancelItem Notification Error]', err));

    return order;
};

export const requestItemReturn = async (orderId, userId, productId, reason, comments, returnQty = 1, platform = null) => {
    if (reason && reason.length > 100) {
        throw new Error('Return reason cannot exceed 100 characters.');
    }
    if (comments && comments.length > 100) {
        throw new Error('Return comments cannot exceed 100 characters.');
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.orderStatus !== 'Delivered' && order.orderStatus !== 'Return Requested' && order.orderStatus !== 'Returned') {
        throw new Error('Only delivered orders can be returned');
    }

    let item = order.items.find(i => {
        const itemProdId = i.product && i.product._id ? i.product._id.toString() : i.product.toString();
        return itemProdId === productId.toString() && (!platform || i.platform === platform) && i.status === 'Ordered' && i.adminReturnComment;
    });
    if (!item) {
        item = order.items.find(i => {
            const itemProdId = i.product && i.product._id ? i.product._id.toString() : i.product.toString();
            return itemProdId === productId.toString() && (!platform || i.platform === platform) && (i.status === 'Ordered' || !i.status);
        });
    }
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
            returnComments: comments,
            adminReturnComment: null
        };
        order.items.push(newItem);
    } else {
        item.status = 'Return Requested';
        item.returnDate = new Date();
        item.returnReason = reason;
        item.returnComments = comments;
        item.adminReturnComment = null;
    }

    order.orderStatus = 'Return Requested';
    await order.save();
    return order;
};

export const requestOrderReturn = async (orderId, userId, reason, comments) => {
    if (reason && reason.length > 100) {
        throw new Error('Return reason cannot exceed 100 characters.');
    }
    if (comments && comments.length > 100) {
        throw new Error('Return comments cannot exceed 100 characters.');
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.orderStatus !== 'Delivered') {
        throw new Error('Only delivered orders can be returned');
    }

    let hasReturnableItems = false;
    order.items.forEach(item => {
        if (item.status === 'Ordered' || !item.status) {
            item.status = 'Return Requested';
            item.returnDate = new Date();
            item.returnReason = reason;
            item.returnComments = comments;
            item.adminReturnComment = null;
            hasReturnableItems = true;
        }
    });

    if (!hasReturnableItems) {
        throw new Error('No items in this order are eligible for return');
    }

    order.orderStatus = 'Return Requested';
    await order.save();
    return order;
};
