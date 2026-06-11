import User from '../models/User.js';
import bcrypt from 'bcrypt';


export const getAdminLogin = (req, res) => {
    res.render('admin/login', { error: null });
};


export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin/login', { error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });

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

        // Regenerate the session ID first (prevents session-fixation attacks),
        // then explicitly save before redirecting so the MemoryStore write is
        // committed before the browser follows the 302 to /admin/users.
        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error('[adminLogin] session.regenerate error:', regenErr);
                return res.render('admin/login', { error: 'Session error. Please try again.' });
            }

            req.session.user = { _id: user._id, role: 'admin' };

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


export const getCustomers = async (req, res) => {
    try {
        const { page = 1, search = '', limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        // Build dynamic search filter across username and email fields
        const queryFilter = search
            ? {
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        // Exclude admin accounts from the customer table
        const filter = { ...queryFilter, role: 'user' };

        const [users, totalCount] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            User.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalCount / limitNum);

        res.render('admin/customer-management', {
            users,
            currentPage: pageNum,
            totalPages,
            totalCount,
            search,
            limit: limitNum,
        });
    } catch (err) {
        console.error('[getCustomers]', err);
        res.status(500).send('Internal Server Error');
    }
};

// Toggle Block / Unblock User

export const toggleBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user || user.role === 'admin') {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        user.is_blocked = !user.is_blocked;
        await user.save();

        return res.status(200).json({
            success: true,
            is_blocked: user.is_blocked,
            message: user.is_blocked
                ? 'User has been suspended.'
                : 'User has been reinstated.',
        });
    } catch (err) {
        console.error('[toggleBlock]', err);
        return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
    }
};


export const adminLogout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};
