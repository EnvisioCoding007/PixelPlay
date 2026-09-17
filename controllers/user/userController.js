import * as userService from '../../services/user/userService.js';
import * as orderService from '../../services/user/orderService.js';

export const getProfile = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const [user, gameStats] = await Promise.all([
            userService.getUserProfile(userId),
            orderService.getUserGameStats(userId)
        ]);
        if (!user) return res.redirect('/login');

        res.render('user/profile', {
            user,
            gamesOwnedCount: gameStats ? gameStats.gamesOwnedCount : 0,
            completedOrderItemsCount: gameStats ? gameStats.completedOrderItemsCount : 0
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getProfileEdit = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserProfile(userId);
        if (!user) return res.redirect('/login');

        res.render('user/profile-edit', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        if (req.body.profile_image && typeof req.body.profile_image === 'string' && req.body.profile_image.startsWith('data:image/')) {
            delete req.body.profile_image;
        }

        const { username, phone, email } = req.body;
        const userId = req.session.user.id || req.session.user;

        const result = await userService.updateUserProfile(userId, { username, phone, email }, req.file);
        if (result.emailChanged) {
            return res.redirect('/verify-email-update');
        }

        res.redirect('/profile');
    } catch (error) {
        console.error('[updateProfile] Error:', error);
        try {
            const userId = req.session.user.id || req.session.user;
            const user = await userService.getUserProfile(userId);
            return res.status(400).render('user/profile-edit', { user, error: error.message });
        } catch {
            return res.status(500).send(error.message || 'Internal Server Error');
        }
    }
};

export const getChangeEmailVerifyPassword = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/login');
        if (user.google_id || !user.password_hash) {
            return res.redirect('/profile');
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.render('user/change-email-verify-password', { user, error: null });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const postChangeEmailVerifyPassword = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required.' });
        }

        await userService.verifyUserPassword(userId, password);

        req.session.emailChangePasswordVerified = true;
        req.session.emailChangePasswordVerifiedAt = Date.now();

        res.status(200).json({
            success: true,
            message: 'Password verified successfully.',
            redirectUrl: '/profile/change-email'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Incorrect password. Please try again.' });
    }
};

export const getChangeEmail = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/login');
        if (user.google_id || !user.password_hash) {
            return res.redirect('/profile');
        }

        const isVerified = req.session.emailChangePasswordVerified;
        const verifiedAt = req.session.emailChangePasswordVerifiedAt;
        const isRecent = verifiedAt && (Date.now() - verifiedAt < 15 * 60 * 1000);

        if (!isVerified || !isRecent) {
            req.session.emailChangePasswordVerified = false;
            return res.redirect('/profile/change-email/verify-password');
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.render('user/change-email', { user, error: null });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const postChangeEmail = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;

        const isVerified = req.session.emailChangePasswordVerified;
        const verifiedAt = req.session.emailChangePasswordVerifiedAt;
        const isRecent = verifiedAt && (Date.now() - verifiedAt < 15 * 60 * 1000);

        if (!isVerified || !isRecent) {
            return res.status(403).json({
                success: false,
                message: 'Password verification required before changing email.',
                redirectUrl: '/profile/change-email/verify-password'
            });
        }

        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'New email address is required.' });
        }

        await userService.initiateEmailUpdate(userId, email);

        req.session.emailChangePasswordVerified = false;
        delete req.session.emailChangePasswordVerifiedAt;

        res.status(200).json({
            success: true,
            message: 'Verification code sent to your new email address.',
            redirectUrl: '/verify-email-update'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getVerifyEmailUpdate = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const pendingEmail = await userService.getPendingEmail(userId);
        if (!pendingEmail) return res.redirect('/profile/edit');

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.render('user/verify-email', { email: pendingEmail, purpose: 'email_update' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyEmailUpdate = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) throw new Error('Email and OTP are required.');

        await userService.otpCheck(email, otp, 'email_update');
        await userService.applyPendingEmail(req.session.user);

        if (req.session.emailChangePasswordVerified) {
            delete req.session.emailChangePasswordVerified;
            delete req.session.emailChangePasswordVerifiedAt;
        }

        res.status(200).json({
            success: true,
            message: 'Email updated successfully! Redirecting to your profile…',
            redirectUrl: '/profile',
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getProfilePassword = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/login');
        res.render('user/password-update', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updatePassword = async (req, res) => {
    try {
        const {
            'current-password': currentPassword,
            'new-password': newPassword,
            'confirm-new-password': confirmPassword
        } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All password fields are required.' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'New passwords do not match.' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }

        await userService.changePassword(req.session.user, currentPassword, newPassword);

        res.status(200).json({
            success: true,
            message: 'Password updated successfully.',
            redirectUrl: '/profile'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getAddresses = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/login');
        res.render('user/saved-addresses', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addAddress = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault } = req.body;

        await userService.addAddress(userId, { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault });
        res.status(200).json({ success: true, message: 'Address added successfully.' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const editAddress = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { addressId } = req.params;
        const { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault } = req.body;

        await userService.editAddress(userId, addressId, { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault });
        res.status(200).json({ success: true, message: 'Address updated successfully.' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { addressId } = req.params;

        await userService.deleteAddress(userId, addressId);
        res.status(200).json({ success: true, message: 'Address removed successfully.' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
