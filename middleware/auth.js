import User from '../models/User.js';
import passport from 'passport';
import * as userController from '../controllers/userController.js';


export const isUserAuth = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    try {
        const user = await User.findById(req.session.user)
            .select('is_blocked role')
            .lean();

        if (!user || user.is_blocked || user.role === 'admin') {
            req.session.destroy(() => {});
            return res.redirect('/auth/login');
        }

        next();
    } catch (err) {
        console.error('[isUserAuth]', err);
        res.redirect('/auth/login');
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
            const adminUser = await User.findById(req.session.admin._id).lean();
            if (!adminUser || adminUser.role !== 'admin') {
                req.session.destroy(() => {});
                return res.redirect('/admin/login');
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
        userController.handleGoogleCallback(req, res, next, err, user, info)
    )(req, res, next);
};