import bcrypt from 'bcrypt';
import * as userService from '../../services/userService.js';

export const getAdminLogin = (req, res) => {
    res.render('admin/login', { error: null });
};

export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin/login', { error: 'Email and password are required.' });
        }

        const user = await userService.getAdminByEmail(email);

        if (!user) {
            return res.render('admin/login', { error: 'Invalid credentials.' });
        }

        if (user.role !== 'admin') {
            return res.render('admin/login', { error: 'Access denied. Admins only.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.render('admin/login', { error: 'Invalid credentials.' });
        }

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
                return res.redirect('/admin/users');
            });
        });
    } catch (err) {
        console.error('[adminLogin]', err);
        return res.render('admin/login', { error: 'An unexpected error occurred. Please try again.' });
    }
};

export const adminLogout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};
