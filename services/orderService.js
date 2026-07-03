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

export const getOrdersByUserPaginated = async (userId, page = 1, limit = 5, sort = 'newest', filterStatus = 'All') => {
    const skip = (page - 1) * limit;
    const query = { userId };
    if (filterStatus && filterStatus !== 'All') {
        query.orderStatus = filterStatus;
    }

    const totalCount = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    let sortObject = { createdAt: -1 };
    if (sort === 'oldest') {
        sortObject = { createdAt: 1 };
    } else if (sort === 'price_desc') {
        sortObject = { finalAmount: -1 };
    } else if (sort === 'price_asc') {
        sortObject = { finalAmount: 1 };
    }

    const orders = await Order.find(query)
        .sort(sortObject)
        .skip(skip)
        .limit(limit)
        .populate('items.product')
        .lean();
    return { orders, totalPages, currentPage: page };
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

    const oldStatus = order.orderStatus;
    order.orderStatus = status;

    if (status === 'Delivered') {
        order.paymentStatus = 'Paid';
    }

    if (oldStatus !== 'Cancelled' && status === 'Cancelled') {
        for (const item of order.items) {
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

export const getOrderDetailsAdmin = async (id) => {
    const order = await Order.findById(id).populate('items.product').populate('userId').lean();
    if (!order) return null;
    const lifetimeOrdersCount = await Order.countDocuments({ userId: order.userId ? order.userId._id : null });
    return { order, lifetimeOrdersCount };
};


