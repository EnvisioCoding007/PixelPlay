import * as userService from '../../services/admin/userService.js';

export const getAdminLogin = (req, res) => {
    res.render('admin/login', { error: null });
};

export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await userService.authenticateAdmin(email, password);

        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error('[adminLogin] session.regenerate error:', regenErr);
                return res.render('admin/login', { error: 'Session error. Please try again.' });
            }

            req.session.admin = { _id: user._id, role: 'admin' };

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('[adminLogin] session.save error:', saveErr);
                    return res.render('admin/login', { error: 'Session error. Please try again.' });
                }
                return res.redirect('/admin/dashboard');
            });
        });
    } catch (err) {
        console.error('[adminLogin]', err);
        return res.render('admin/login', { error: err.message || 'An unexpected error occurred. Please try again.' });
    }
};

export const adminLogout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};
