import * as notificationHelper from '../shared/notificationHelper.js';

export const getUserNotifications = async (userId, limit = 20, page = 1) => {
    return await notificationHelper.getNotificationsByUser(userId, limit, page);
};

export const getUnreadCount = async (userId) => {
    return await notificationHelper.getUnreadNotificationCount(userId);
};

export const markAsRead = async (userId, notificationId) => {
    return await notificationHelper.markNotificationAsRead(userId, notificationId);
};

export const markAllAsRead = async (userId) => {
    return await notificationHelper.markAllNotificationsAsRead(userId);
};

export const deleteReadNotifications = async (userId) => {
    return await notificationHelper.deleteReadNotifications(userId);
};

export const deleteNotification = async (userId, notificationId) => {
    return await notificationHelper.deleteNotification(userId, notificationId);
};
