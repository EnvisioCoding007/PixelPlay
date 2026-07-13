import * as userService from '../../services/userService.js';
import { uploadToCloudinary } from '../../config/cloudinary.js';

export const getProfile = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserProfile(userId);
        if (!user) return res.redirect('/auth/login');

        res.render('user/profile', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getProfileEdit = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserProfile(userId);
        if (!user) return res.redirect('/auth/login');

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
            return res.redirect('/user/verify-email-update');
        }

        res.redirect('/user/profile');
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getVerifyEmailUpdate = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const pendingEmail = await userService.getPendingEmail(userId);
        if (!pendingEmail) return res.redirect('/user/profile/edit');

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

        res.status(200).json({
            success: true,
            message: 'Email updated successfully! Redirecting to your profile…',
            redirectUrl: '/user/profile',
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getProfilePassword = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');
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
            redirectUrl: '/user/profile'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getAddresses = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');
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

export const updateAvatar = async(req,res)=>{
    try{
        if(!req.file){
            return res.status(400).json({
                success:false,
                message:'No file uploaded.'
            });
        }
        const userId = req.session.user.id || req.session.user;
        const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
        const secureCloudUrl = uploadResult.secure_url;

        const updatedUser = await userService.updateUserProfileImage(userId, secureCloudUrl);

        return res.status(200).json({
            success:true,
            message: 'Profile picture update successfully!',
            url: updatedUser.profile_image
        });
    } catch(error){
        console.error('[userController.updateAvatar Error]:',error);
        return res.status(500).json({success:false, message: 'Internal Server Upload Error'});
    }
};
