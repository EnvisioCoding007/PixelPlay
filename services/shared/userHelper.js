import User from '../../models/User.js';

export const validateUsername = (username) => {
    if (!username || username.trim().length < 3) return 'Username must be at least 3 characters long.';
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) return 'Username can only contain letters, numbers, and underscores.';
    return null;
};

export const validateFullName = (fullName) => {
    if (!fullName || fullName.trim().length < 2) return 'Full Name must be at least 2 characters long.';
    if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) return 'Full Name can only contain letters and spaces.';
    return null;
};

export const getUserById = async (userId) => {
    try {
        return await User.findById(userId);
    } catch (error) {
        console.error('[userHelper.getUserById] Error:', error);
        throw error;
    }
};

export const getUserByEmail = async (email) => {
    try {
        return await User.findOne({ email: email.toLowerCase() });
    } catch (error) {
        console.error('[userHelper.getUserByEmail] Error:', error);
        throw error;
    }
};
