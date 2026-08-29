import * as supportService from '../../services/user/supportService.js';
import * as userService from '../../services/user/userService.js';

const getAuthUserId = (req) => {
    if (req.session && req.session.user) {
        return req.session.user._id || req.session.user.id || req.session.user;
    }
    if (req.user) {
        return req.user._id || req.user.id || req.user;
    }
    return null;
};

export const getSupportPage = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const user = userId ? await userService.getUserById(userId).catch(() => null) : null;

        res.render('user/support', {
            user,
            activeTab: 'support',
            title: 'Support Center · PixelPlay',
            category: req.query.category || ''
        });
    } catch (err) {
        console.error('[getSupportPage] Error:', err);
        res.status(500).render('user/support', {
            user: null,
            activeTab: 'support',
            title: 'Support Center · PixelPlay',
            category: ''
        });
    }
};

export const submitSupportRequest = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const loggedInUser = userId ? await userService.getUserById(userId).catch(() => null) : null;

        const { subject, category, description, username, email } = req.body;

        const finalUsername = (loggedInUser && loggedInUser.username) ? loggedInUser.username : (username || 'Guest User');
        const finalEmail = (loggedInUser && loggedInUser.email) ? loggedInUser.email : (email || '');

        await supportService.processSupportRequest({
            username: finalUsername,
            email: finalEmail,
            subject,
            category,
            description
        });

        res.status(200).json({
            success: true,
            message: 'Your support request has been submitted successfully! Our support team will get back to you via email shortly.'
        });
    } catch (err) {
        console.error('[submitSupportRequest] Error:', err);
        res.status(400).json({
            success: false,
            message: err.message || 'Failed to submit support request. Please try again.'
        });
    }
};
