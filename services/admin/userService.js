import User from '../../models/User.js';
import bcrypt from 'bcrypt';

export const authenticateAdmin = async (email, password) => {
    try {
        if (!email || !password) {
            throw new Error('Email and password are required.');
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            throw new Error('Invalid credentials.');
        }

        if (user.role !== 'admin') {
            throw new Error('Access denied. Admins only.');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            throw new Error('Invalid credentials.');
        }

        return user;
    } catch (error) {
        console.error('[userService.authenticateAdmin] Error:', error);
        throw error;
    }
};

export const getUserByEmail = async (email) => {
    try {
        return await User.findOne({ email: email.toLowerCase().trim() });
    } catch (error) {
        console.error('[userService.getUserByEmail] Error:', error);
        throw error;
    }
};

export const getAdminByEmail = getUserByEmail;

export const getCustomers = async (search = '', status = '', verification = '', sort = '-createdAt', page = 1, limit = 10) => {
    try {
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        const queryFilter = search
            ? {
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        const filter = { ...queryFilter, role: 'user' };

        if (status === 'active') {
            filter.is_blocked = false;
        } else if (status === 'suspended') {
            filter.is_blocked = true;
        }

        if (verification === 'verified') {
            filter.is_verified = true;
        } else if (verification === 'unverified') {
            filter.is_verified = false;
        }

        let sortConfig = { createdAt: -1 };
        if (sort === '-createdAt') {
            sortConfig = { createdAt: -1 };
        } else if (sort === 'createdAt') {
            sortConfig = { createdAt: 1 };
        } else if (sort === 'name_asc') {
            sortConfig = { username: 1 };
        } else if (sort === 'name_desc') {
            sortConfig = { username: -1 };
        }

        const [users, totalCount] = await Promise.all([
            User.find(filter)
                .sort(sortConfig)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            User.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalCount / limitNum);

        return {
            users,
            currentPage: pageNum,
            totalPages,
            totalCount
        };
    } catch (error) {
        console.error('[userService.getCustomers] Error:', error);
        throw error;
    }
};

export const toggleUserBlock = async (id) => {
    try {
        const user = await User.findById(id);

        if (!user || user.role === 'admin') {
            throw new Error('User not found.');
        }

        user.is_blocked = !user.is_blocked;
        await user.save();

        return {
            is_blocked: user.is_blocked,
            message: user.is_blocked ? 'User has been suspended.' : 'User has been reinstated.'
        };
    } catch (error) {
        console.error('[userService.toggleUserBlock] Error:', error);
        throw error;
    }
};

export const getUserById = async (userId) => {
    try {
        return await User.findById(userId).lean();
    } catch (error) {
        console.error('[userService.getUserById] Error:', error);
        throw error;
    }
};
