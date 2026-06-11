import User from '../models/User.js';
import bcrypt from 'bcrypt';
import * as userService from '../services/userService.js';

export const getSignupPage = (req, res) => {
    res.render('user/signup');
};

export const getVerifyEmailPage = (req, res) => {
    const email = req.query.email;
    res.render('user/verify-email', {
        email, purpose: 'signup'
    });
};

export const getForgetPasswordPage = (req, res) => {
    res.render('user/forgot-password');
};

export const getResetPasswordPage = (req, res) => {
    if (!req.session.resetEmail || !req.session.otpVerified) {
        return res.redirect('/auth/forgot-password');
    }
    res.render('user/reset-password');
};

export const signup = async (req, res) => {
    try {
        const { username, email, password, confirmPassword, referralCode } = req.body;

        if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
        }

        await userService.registerLocalUser(username, email, password, referralCode);

        await userService.generateOTP(email, 'signup');

        res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            redirectUrl: `/auth/verify-email?email=${encodeURIComponent(email)}`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const sendVerificationOtp = async (req, res) => {
    try {
        const { email, purpose } = req.body;

        if (!email) {
            throw new Error('Email is required to send an OTP.');
        }

        const VALID_PURPOSES = ['signup', 'forgot', 'email_update'];
        const otpPurpose = VALID_PURPOSES.includes(purpose) ? purpose : 'signup';

        await userService.generateOTP(email, otpPurpose);

        res.status(200).json({
            success: true,
            message: 'Verification code sent to your mail.'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            throw new Error('Email and OTP are required.');
        }
        await userService.otpCheck(email, otp, 'signup');
        res.status(200).json({
            success: true,
            message: 'OTP verification successful! Redirecting to login…',
            redirectUrl: '/auth/login'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const getLogin = (req, res) => {
    res.render('user/login');
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new Error('Email and password are required');
        }
        const user = await userService.loginAuth(email, password);

        req.session.user = user._id;

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            redirectUrl: '/home'
        });
    } catch (error) {
        if (error.code === 'UNVERIFIED') {
            return res.status(403).json({
                success: false,
                message: error.message,
                redirectUrl: `/auth/verify-email?email=${encodeURIComponent(req.body.email)}`
            });
        }

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const getHome = (req, res) => {
    res.render('user/home');
};

export const getProfile = async (req, res) => {
    try {
        const rawUser = await User.findById(req.session.user).select('password_hash').lean();
        const user = await User.findById(req.session.user).select('-password_hash').lean();
        if (!user) {
            return res.redirect('/auth/login');
        }
        // Attach a boolean so the EJS guard works without leaking the hash
        user.password_hash = rawUser?.password_hash ? true : null;
        res.render('user/profile', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getProfileEdit = async (req, res) => {
    try {
        const rawUser = await User.findById(req.session.user).select('password_hash').lean();
        const user = await User.findById(req.session.user).select('-password_hash').lean();
        if (!user) {
            return res.redirect('/auth/login');
        }
        // Attach a boolean so the EJS guard works without leaking the hash
        user.password_hash = rawUser?.password_hash ? true : null;
        res.render('user/profile-edit', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getProfilePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).select('-password_hash').lean();
        if (!user) {
            return res.redirect('/auth/login');
        }
        res.render('user/password-update', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { username, phone, email } = req.body;

        if (!username || !username.trim()) {
            return res.status(400).json({ success: false, message: 'Username cannot be empty.' });
        }

        const currentUser = await User.findById(req.session.user).select('email').lean();
        if (!currentUser) {
            return res.redirect('/auth/login');
        }

        const updateFields = {
            username: username.trim(),
            phone: phone?.trim() || null,
        };

        // If email changed, store as pending and trigger OTP
        const submittedEmail = email?.trim().toLowerCase();
        if (submittedEmail && submittedEmail !== currentUser.email) {
            // Check the new address isn't already taken
            const conflict = await User.findOne({ email: submittedEmail });
            if (conflict) {
                return res.status(400).json({ success: false, message: 'This email address is already in use.' });
            }

            await User.findByIdAndUpdate(
                req.session.user,
                { ...updateFields, pending_email: submittedEmail },
                { runValidators: true }
            );

            // Send OTP to the new address
            await userService.generateOTP(submittedEmail, 'email_update');

            return res.redirect(
                `/auth/verify-email-update?email=${encodeURIComponent(submittedEmail)}`
            );
        }

        // No email change
        await User.findByIdAndUpdate(
            req.session.user,
            updateFields,
            { runValidators: true }
        );

        res.redirect('/auth/profile');
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getVerifyEmailUpdate = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).select('pending_email').lean();
        if (!user || !user.pending_email) {
            return res.redirect('/auth/profile/edit');
        }
        res.render('user/verify-email', {
            email: user.pending_email,
            purpose: 'email_update',
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyEmailUpdate = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            throw new Error('Email and OTP are required.');
        }

        // Validate the OTP against the pending address
        await userService.otpCheck(email, otp, 'email_update');

        // Atomically promote pending_email to email
        await userService.applyPendingEmail(req.session.user);

        res.status(200).json({
            success: true,
            message: 'Email updated successfully! Redirecting to your profile…',
            redirectUrl: '/auth/profile',
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updatePassword = async (req, res) => {
    try {
        const { 'current-password': currentPassword, 'new-password': newPassword, 'confirm-new-password': confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All password fields are required.' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'New passwords do not match.' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }

        // Re-fetch with password_hash for verification
        const userDoc = await User.findById(req.session.user).select('password_hash').lean();
        if (!userDoc || !userDoc.password_hash) {
            return res.status(400).json({ success: false, message: 'Password update is not available for this account.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, userDoc.password_hash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(
            req.session.user,
            { password_hash: hashedPassword }
        );

        res.redirect('/auth/profile');
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'An error occurred during logout'
            });
        }

        res.clearCookie('connect.sid');

        return res.redirect('/auth/login');
    });
};

export const forgotPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            throw new Error('Email is required.');
        }

        const existingUser = await User.findOne({ email });

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: 'No account found with that email address.'
            });
        }

        if (!existingUser.password_hash) {
            return res.status(400).json({
                success: false,
                message: 'This account uses Google Sign-In. Please log in using Google.'
            });
        }

        await userService.generateOTP(email, 'forgot');

        req.session.resetEmail = email;

        res.status(200).json({
            success: true,
            message: 'Password reset code sent to your email.',
            redirectUrl: '/auth/reset-password-otp'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const resetPasswordOtpPage = (req, res) => {
    if (!req.session.resetEmail) {
        return res.redirect('/auth/forgot-password');
    }

    res.render('user/verify-email', {
        email: req.session.resetEmail,
        purpose: 'forgot'
    });
};


export const verifyForgotPasswordOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const email = req.session.resetEmail;

        if (!email || !otp) {
            throw new Error('Session expired or OTP missing. Please try again.');
        }

        await userService.otpCheck(email, otp, 'forgot');

        req.session.otpVerified = true;

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully.',
            redirectUrl: '/auth/reset-password'
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;
        const email = req.session.resetEmail;

        if (!email || !req.session.otpVerified) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized request. Please verify your OTP first.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match.'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await User.findOneAndUpdate(
            { email },
            { password_hash: hashedPassword }
        );

        req.session.resetEmail = null;
        req.session.otpVerified = null;

        res.status(200).json({
            success: true,
            message: 'Password reset successfully.',
            redirectUrl: '/auth/login'
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'An internal error occurred.'
        });
    }
};

// Address Management 

export const getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).lean();
        if (!user) return res.redirect('/auth/login');
        res.render('user/saved-addresses', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addAddress = async (req, res) => {
    try {
        const { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault } = req.body;

        if (!fullName || !phone || !addressLine1 || !city || !state || !postal_code) {
            return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
        }

        const user = await User.findById(req.session.user);
        if (!user) return res.status(401).json({ success: false, message: 'Session expired.' });

        // If this address is being set as default, clear existing defaults first
        if (isDefault === 'true' || isDefault === true) {
            user.addresses.forEach(addr => { addr.isDefault = false; });
        }

        user.addresses.push({
            fullName: fullName.trim(),
            phone: phone.trim(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2?.trim() || '',
            city: city.trim(),
            state: state.trim(),
            postal_code: Number(postal_code),
            country: country?.trim() || 'India',
            address_type: address_type || 'home',
            isDefault: isDefault === 'true' || isDefault === true,
        });

        await user.save();
        res.status(200).json({ success: true, message: 'Address added successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const editAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault } = req.body;

        if (!fullName || !phone || !addressLine1 || !city || !state || !postal_code) {
            return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
        }

        const user = await User.findById(req.session.user);
        if (!user) return res.status(401).json({ success: false, message: 'Session expired.' });

        const address = user.addresses.id(addressId);
        if (!address) return res.status(404).json({ success: false, message: 'Address not found.' });

        // If setting this one as default, clear others first
        if (isDefault === 'true' || isDefault === true) {
            user.addresses.forEach(addr => { addr.isDefault = false; });
        }

        Object.assign(address, {
            fullName: fullName.trim(),
            phone: phone.trim(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2?.trim() || '',
            city: city.trim(),
            state: state.trim(),
            postal_code: Number(postal_code),
            country: country?.trim() || 'India',
            address_type: address_type || 'home',
            isDefault: isDefault === 'true' || isDefault === true,
        });

        await user.save();
        res.status(200).json({ success: true, message: 'Address updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.session.user);
        if (!user) return res.status(401).json({ success: false, message: 'Session expired.' });

        const before = user.addresses.length;
        user.addresses.pull({ _id: addressId });

        if (user.addresses.length === before) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        await user.save();
        res.status(200).json({ success: true, message: 'Address removed successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};