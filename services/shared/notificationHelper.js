import Notification from '../../models/Notification.js';
import Wishlist from '../../models/Wishlist.js';
import { emitToUser } from '../../config/socket.js';

/**
 * Creates and stores a notification for a user, then emits a real-time WebSocket event.
 */
export const createNotificationForUser = async (userId, { type, title, message, link = null, metadata = {} }) => {
    try {
        if (!userId) return null;

        const notification = new Notification({
            userId,
            type,
            title,
            message,
            link,
            metadata
        });

        await notification.save();

        const unreadCount = await getUnreadNotificationCount(userId);

        emitToUser(userId, 'new_notification', {
            notification,
            unreadCount
        });

        return notification;
    } catch (error) {
        console.error('[createNotificationForUser] Error:', error);
        return null;
    }
};

/**
 * Gets count of unread notifications for a user.
 */
export const getUnreadNotificationCount = async (userId) => {
    try {
        if (!userId) return 0;
        return await Notification.countDocuments({ userId, isRead: false });
    } catch (error) {
        console.error('[getUnreadNotificationCount] Error:', error);
        return 0;
    }
};

/**
 * Gets user notifications sorted by newest first.
 */
export const getNotificationsByUser = async (userId, limit = 20, page = 1) => {
    try {
        if (!userId) return { notifications: [], totalCount: 0, unreadCount: 0 };
        const limitNum = Math.max(1, parseInt(limit, 10));
        const pageNum = Math.max(1, parseInt(page, 10));
        const skip = (pageNum - 1) * limitNum;

        const [notifications, totalCount, unreadCount] = await Promise.all([
            Notification.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Notification.countDocuments({ userId }),
            getUnreadNotificationCount(userId)
        ]);

        return { notifications, totalCount, unreadCount, page: pageNum };
    } catch (error) {
        console.error('[getNotificationsByUser] Error:', error);
        return { notifications: [], totalCount: 0, unreadCount: 0 };
    }
};

/**
 * Marks a specific notification as read.
 */
export const markNotificationAsRead = async (userId, notificationId) => {
    try {
        await Notification.updateOne({ _id: notificationId, userId }, { isRead: true });
        const unreadCount = await getUnreadNotificationCount(userId);
        return { success: true, unreadCount };
    } catch (error) {
        console.error('[markNotificationAsRead] Error:', error);
        throw error;
    }
};

/**
 * Marks all unread notifications for a user as read.
 */
export const markAllNotificationsAsRead = async (userId) => {
    try {
        await Notification.updateMany({ userId, isRead: false }, { isRead: true });
        return { success: true, unreadCount: 0 };
    } catch (error) {
        console.error('[markAllNotificationsAsRead] Error:', error);
        throw error;
    }
};

/**
 * Deletes all read notifications for a user.
 */
export const deleteReadNotifications = async (userId) => {
    try {
        const result = await Notification.deleteMany({ userId, isRead: true });
        const unreadCount = await getUnreadNotificationCount(userId);
        return { success: true, deletedCount: result.deletedCount, unreadCount };
    } catch (error) {
        console.error('[deleteReadNotifications] Error:', error);
        throw error;
    }
};

/**
 * Deletes a specific notification.
 */
export const deleteNotification = async (userId, notificationId) => {
    try {
        await Notification.deleteOne({ _id: notificationId, userId });
        const unreadCount = await getUnreadNotificationCount(userId);
        return { success: true, unreadCount };
    } catch (error) {
        console.error('[deleteNotification] Error:', error);
        throw error;
    }
};

/**
 * Checks all wishlists for users who wishlisted a restocked product, and notifies them.
 */
export const checkAndNotifyRestock = async (productId, productTitle = null) => {
    try {
        if (!productId) return;
        const prodIdStr = productId._id ? productId._id.toString() : productId.toString();

        let title = productTitle;
        if (!title) {
            const Product = (await import('../../models/Product.js')).default;
            const product = await Product.findById(prodIdStr).select('title').lean();
            if (product) {
                title = product.title;
            }
        }

        const wishlists = await Wishlist.find({ 'items.product': prodIdStr }).select('userId').lean();
        if (!wishlists || wishlists.length === 0) return;

        for (const wishlist of wishlists) {
            await createNotificationForUser(wishlist.userId, {
                type: 'restock',
                title: 'Item Back in Stock!',
                message: `"${title || 'An item'}" in your wishlist is now back in stock!`,
                link: `/products/${prodIdStr}`,
                metadata: { productId: prodIdStr }
            });
        }
    } catch (error) {
        console.error('[checkAndNotifyRestock] Error:', error);
    }
};

/**
 * Checks all wishlists for users who wishlisted a product that gets an offer, and notifies them.
 */
export const checkAndNotifyOffer = async (offerDoc) => {
    try {
        if (!offerDoc) return;
        const offer = offerDoc.toObject ? offerDoc.toObject() : offerDoc;
        if (!offer.isActive) return;

        let affectedProducts = [];
        const Product = (await import('../../models/Product.js')).default;

        if (offer.targetType === 'Product' && offer.targetProduct) {
            const prodId = offer.targetProduct._id ? offer.targetProduct._id : offer.targetProduct;
            const prod = await Product.findById(prodId).select('_id title').lean();
            if (prod) affectedProducts.push(prod);
        } else if (offer.targetType === 'Category' && offer.targetCategory) {
            const catId = offer.targetCategory._id ? offer.targetCategory._id : offer.targetCategory;
            affectedProducts = await Product.find({ category: catId, status: 'Live' }).select('_id title').lean();
        } else if (offer.targetType === 'Publisher' && offer.targetPublisher) {
            affectedProducts = await Product.find({ publisher: offer.targetPublisher, status: 'Live' }).select('_id title').lean();
        }

        if (!affectedProducts || affectedProducts.length === 0) return;

        const discountDisplay = offer.discountType === 'percentage'
            ? `${offer.discountValue}% OFF`
            : `₹${(offer.discountValue / 100).toFixed(2)} OFF`;

        for (const prod of affectedProducts) {
            const prodIdStr = prod._id.toString();
            const wishlists = await Wishlist.find({ 'items.product': prodIdStr }).select('userId').lean();
            for (const wishlist of wishlists) {
                await createNotificationForUser(wishlist.userId, {
                    type: 'offer',
                    title: 'Special Offer Available!',
                    message: `"${prod.title}" in your wishlist is now on offer (${discountDisplay})! Offer: ${offer.title}`,
                    link: `/products/${prodIdStr}`,
                    metadata: { offerId: offer._id, productId: prodIdStr }
                });
            }
        }
    } catch (error) {
        console.error('[checkAndNotifyOffer] Error:', error);
    }
};

/**
 * Checks all wishlists for users who wishlisted a product whose stock falls below 5, and notifies them.
 */
export const checkAndNotifyLowStock = async (productId, oldStock, newStock, productTitle = null) => {
    try {
        if (!productId) return;
        const stockNum = Number(newStock);
        const prevStockNum = Number(oldStock);

        if (stockNum > 0 && stockNum < 5 && (isNaN(prevStockNum) || prevStockNum >= 5)) {
            const prodIdStr = productId._id ? productId._id.toString() : productId.toString();
            let title = productTitle;
            if (!title) {
                const Product = (await import('../../models/Product.js')).default;
                const product = await Product.findById(prodIdStr).select('title').lean();
                if (product) {
                    title = product.title;
                }
            }

            const wishlists = await Wishlist.find({ 'items.product': prodIdStr }).select('userId').lean();
            if (!wishlists || wishlists.length === 0) return;

            for (const wishlist of wishlists) {
                await createNotificationForUser(wishlist.userId, {
                    type: 'low_stock',
                    title: 'Low Stock Warning!',
                    message: `Hurry! Only ${stockNum} unit${stockNum === 1 ? '' : 's'} left in stock for "${title || 'an item'}" in your wishlist!`,
                    link: `/products/${prodIdStr}`,
                    metadata: { productId: prodIdStr, stock: stockNum }
                });
            }
        }
    } catch (error) {
        console.error('[checkAndNotifyLowStock] Error:', error);
    }
};

