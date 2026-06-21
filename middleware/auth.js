import User from '../models/User.js';


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


export const isAdminAuth = (req, res, next) => {
    if (req.session.admin && req.session.admin.role === 'admin') {
        next();
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