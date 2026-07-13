import * as userService from '../../services/userService.js';

export const getSignupPage = (req, res) => {
    res.render('user/signup');
};

export const signup = async (req, res) => {
    try {
        const { username, email, password, confirmPassword, referralCode } = req.body;

        if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
        }

        await userService.registerLocalUser(username, email, password, referralCode);
        await userService.generateOTP(email, 'signup');

        req.session.pendingVerifyEmail = email;

        res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            redirectUrl: '/auth/verify-email'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getVerifyEmailPage = (req, res) => {
    const email = req.session.pendingVerifyEmail;
    if (!email) return res.redirect('/auth/signup');

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.render('user/verify-email', { email, purpose: 'signup' });
};

export const sendVerificationOtp = async (req, res) => {
    try {
        const { email, purpose } = req.body;
        if (!email) throw new Error('Email is required to send an OTP.');

        const VALID_PURPOSES = ['signup', 'forgot', 'email_update'];
        const otpPurpose = VALID_PURPOSES.includes(purpose) ? purpose : 'signup';

        await userService.generateOTP(email, otpPurpose);

        res.status(200).json({ success: true, message: 'Verification code sent to your mail.' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) throw new Error('Email and OTP are required.');

        await userService.otpCheck(email, otp, 'signup');

        delete req.session.pendingVerifyEmail;

        res.status(200).json({
            success: true,
            message: 'OTP verification successful! Redirecting to login…',
            redirectUrl: '/auth/login'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getLogin = (req, res) => {
    res.render('user/login');
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) throw new Error('Email and password are required');

        const user = await userService.loginAuth(email, password);
        req.session.user = user._id;

        res.status(200).json({ success: true, message: 'Login successful!', redirectUrl: '/home' });
    } catch (error) {
        if (error.code === 'UNVERIFIED') {
            req.session.pendingVerifyEmail = req.body.email;
            return res.status(403).json({
                success: false,
                message: error.message,
                redirectUrl: '/auth/verify-email'
            });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const handleGoogleCallback = (req, res, next, err, user, info) => {
    if (err) return next(err);

    if (!user) {
        const message = (info && info.message) || 'Authentication failed. Please try again.';
        return res.redirect(`/auth/login?error=${encodeURIComponent(message)}`);
    }

    req.session.user = user._id;
    res.redirect('/home');
};

export const getForgetPasswordPage = (req, res) => {
    res.render('user/forgot-password');
};

export const forgotPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) throw new Error('Email is required.');

        const existingUser = await userService.getAdminByEmail(email);
        if (!existingUser) {
            return res.status(404).json({ success: false, message: 'No account found with that email address.' });
        }

        if (!existingUser.password_hash) {
            return res.status(400).json({
                success: false,
                message: 'This account uses Google Sign-In. Please log in using Google.'
            });
        }

        if (existingUser.is_verified !== true) {
            await userService.checkAndSendSignupOtp(email);
            req.session.pendingVerifyEmail = email;
            return res.status(200).json({
                success: true,
                message: 'Your email is not verified. Redirecting to verification page...',
                redirectUrl: '/auth/verify-email'
            });
        }

        const { sentNew } = await userService.checkAndSendForgotPasswordOtp(email);
        req.session.resetEmail = email;

        res.status(200).json({
            success: true,
            message: sentNew
                ? 'Password reset code sent to your email.'
                : 'A valid reset code already exists. Redirecting to verification page...',
            redirectUrl: '/auth/reset-password-otp'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const resetPasswordOtpPage = (req, res) => {
    if (!req.session.resetEmail) return res.redirect('/auth/forgot-password');

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.render('user/verify-email', { email: req.session.resetEmail, purpose: 'forgot' });
};

export const verifyForgotPasswordOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const email = req.session.resetEmail;

        if (!email || !otp) throw new Error('Session expired or OTP missing. Please try again.');

        await userService.otpCheck(email, otp, 'forgot');
        req.session.otpVerified = true;

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully.',
            redirectUrl: '/auth/reset-password'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getResetPasswordPage = (req, res) => {
    if (!req.session.resetEmail || !req.session.otpVerified) {
        return res.redirect('/auth/forgot-password');
    }
    res.render('user/reset-password');
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
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        await userService.resetPasswordByEmail(email, password);

        req.session.resetEmail = null;
        req.session.otpVerified = null;

        res.status(200).json({
            success: true,
            message: 'Password reset successfully.',
            redirectUrl: '/auth/login'
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred.' });
    }
};

export const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'An error occurred during logout' });
        }
        res.clearCookie('connect.sid');
        return res.redirect('/auth/login');
    });
};
