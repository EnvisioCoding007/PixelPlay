import { getUnreadCount } from '../services/user/notificationService.js';

export const injectNotificationCount = async (req, res, next) => {
    res.locals.unreadNotificationCount = 0;
    if (req.session && req.session.user) {
        try {
            const userId = req.session.user._id || req.session.user.id || req.session.user;
            res.locals.unreadNotificationCount = await getUnreadCount(userId);
        } catch (err) {
            console.error('[injectNotificationCount] Error:', err);
        }
    }
    next();
};
