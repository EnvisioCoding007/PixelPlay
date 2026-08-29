import * as userService from '../services/user/userService.js';
import passport from 'passport';
import * as authController from '../controllers/user/authController.js';


export const isUserAuth = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);

        if (!user || user.is_blocked || user.role === 'admin') {
            return req.session.destroy(() => {
                res.redirect('/login');
            });
        }

        next();
    } catch (err) {
        console.error('[isUserAuth]', err);
        res.redirect('/login');
    }
};

export const isUserUnAuth = (req, res, next) => {
    if (req.session.user) {
        res.redirect('/home');
    } else {
        next();
    }
};


export const isAdminAuth = async (req, res, next) => {
    if (req.session.admin && req.session.admin.role === 'admin') {
        try {
            const adminUser = await userService.getUserById(req.session.admin._id);
            if (!adminUser || adminUser.role !== 'admin') {
                return req.session.destroy(() => {
                    res.redirect('/admin/login');
                });
            }
            res.locals.user = adminUser;
            req.session.admin = adminUser;
            next();
        } catch (err) {
            console.error('[isAdminAuth] Error fetching admin user details:', err);
            res.redirect('/admin/login');
        }
    } else {
        const isAjax =
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            (req.headers['accept'] && req.headers['accept'].includes('application/json'));

        if (isAjax) {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.',
            });
        }
        res.redirect('/admin/login');
    }
};


export const isAdminUnAuth = (req, res, next) => {
    if (req.session.admin && req.session.admin.role === 'admin') {
        res.redirect('/admin/users');
    } else {
        next();
    }
};

export const handleGoogleAuth = (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) =>
        authController.handleGoogleCallback(req, res, next, err, user, info)
    )(req, res, next);
};