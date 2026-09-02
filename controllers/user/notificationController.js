import * as notificationService from '../../services/user/notificationService.js';

export const getNotifications = async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id || req.session.user;
        const { limit = 20, page = 1 } = req.query;
        const result = await notificationService.getUserNotifications(userId, limit, page);
        return res.status(200).json({
            success: true,
            notifications: result.notifications,
            totalCount: result.totalCount,
            unreadCount: result.unreadCount,
            page: result.page
        });
    } catch (error) {
        console.error('[getNotifications] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id || req.session.user;
        const { id } = req.params;
        const result = await notificationService.markAsRead(userId, id);
        return res.status(200).json({ success: true, unreadCount: result.unreadCount });
    } catch (error) {
        console.error('[markAsRead] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
    }
};

export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id || req.session.user;
        await notificationService.markAllAsRead(userId);
        return res.status(200).json({ success: true, unreadCount: 0 });
    } catch (error) {
        console.error('[markAllAsRead] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to mark all notifications as read.' });
    }
};

export const deleteReadNotifications = async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id || req.session.user;
        const result = await notificationService.deleteReadNotifications(userId);
        return res.status(200).json({
            success: true,
            deletedCount: result.deletedCount,
            unreadCount: result.unreadCount,
            message: 'All read notifications have been deleted.'
        });
    } catch (error) {
        console.error('[deleteReadNotifications] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete read notifications.' });
    }
};

export const deleteNotification = async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id || req.session.user;
        const { id } = req.params;
        const result = await notificationService.deleteNotification(userId, id);
        return res.status(200).json({ success: true, unreadCount: result.unreadCount });
    } catch (error) {
        console.error('[deleteNotification] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete notification.' });
    }
};
