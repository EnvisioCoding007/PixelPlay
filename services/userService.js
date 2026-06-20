import User from '../models/User.js';
import bcrypt from 'bcrypt';
import OTP from '../models/Otpmodel.js';
import { sendEmail } from '../utils/emailSender.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,}$/;
export const registerLocalUser = async (username, email, password, referralCode) => {
    if (!EMAIL_REGEX.test(email)) {
        throw new Error('Please enter a valid email address.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new Error('A user with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        email,
        password_hash: hashedPassword,
        referred_by: referralCode || null,
        authProvider: 'local'
    });

    await newUser.save();
    return newUser;
};

export const generateOTP = async (email, purpose) => {
    await OTP.deleteMany({ email, purpose });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 5 * 60 * 1000);

    const newOtp = new OTP({ email, otp: otpCode, purpose, expires_at });
    await newOtp.save();

    const emailTemplates = {
        signup: {
            subject: 'Verify your PixelPlay Account',
            text: `Welcome to PixelPlay! Your verification code is: ${otpCode}. It will expire in 5 minutes.`
        },
        forgot: {
            subject: 'Reset your PixelPlay Password',
            text: `We received a request to reset your PixelPlay password. Your verification code is: ${otpCode}. It will expire in 5 minutes. If you did not request this, please ignore this email.`
        },
        email_update: {
            subject: 'Update your PixelPlay Email',
            text: `We received a request to update your Email address on PixelPlay. Your verification code is: ${otpCode}. It will expire in 5 minutes. If you did not request this, please ignore this email.`
        }
    };

    const template = emailTemplates[purpose] || emailTemplates.signup;
    sendEmail(email, template.subject, template.text)
        .catch(err => console.error('Background SMTP delivery failure:', err));

    return true;
};

export const otpCheck = async (email, otp, purpose = 'signup') => {
    const dbOtp = await OTP.findOne({ email, purpose });
    if (!dbOtp) {
        throw new Error('Invalid or incorrect OTP.');
    }
    if (dbOtp.expires_at < Date.now()) {
        await OTP.deleteOne({ _id: dbOtp._id });
        throw new Error('OTP expired. Please request a new one.');
    }
    if (dbOtp.otp !== otp) {
        dbOtp.attempts += 1;
        if (dbOtp.attempts >= 3) {
            await OTP.deleteOne({ _id: dbOtp._id });
            throw new Error('Too many failed attempts. Please request a new OTP.');
        }
        await dbOtp.save();
        throw new Error(`Incorrect OTP. You have ${3 - dbOtp.attempts} attempts left.`);
    }

    if (purpose === 'signup') {
        await User.findOneAndUpdate({ email }, { is_verified: true });
    }

    await OTP.deleteOne({ _id: dbOtp._id });
    return true;
};

export const loginAuth = async (email, password) => {
    const userData = await User.findOne({ email });

    if (!userData) {
        throw new Error('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(password, userData.password_hash);
    if (!passwordMatch) {
        throw new Error('Invalid email or password.');
    }

    if (userData.is_verified !== true) {
        const error = new Error('Please verify your email before logging in.');
        error.code = 'UNVERIFIED';
        throw error;
    }

    if (userData.is_blocked) {
        throw new Error('Your account has been suspended. Please contact support.');
    }

    userData.last_login_at = new Date();
    await userData.save();

    return userData;
};

/**
 * Handles Google OAuth user lookup/creation. Called by passport.js strategy.
 * Throws a tagged error when the account is blocked so the caller can
 * distinguish it from an unexpected server error.
 */
export const handleGoogleAuth = async (profile) => {
    let user = await User.findOne({ email: profile.emails[0].value });

    if (user) {
        if (user.is_blocked) {
            const error = new Error('Your account has been suspended. Please contact support.');
            error.isBlocked = true;
            throw error;
        }
        user.last_login_at = new Date();
        await user.save();
        return user;
    }

    user = new User({
        username: profile.displayName,
        email: profile.emails[0].value,
        is_verified: true,
        last_login_at: new Date()
    });

    await user.save();
    return user;
};

/**
 * Validates the current password and replaces it with a new one.
 * Used by the authenticated "change password" flow.
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
    const userDoc = await User.findById(userId).select('password_hash');
    if (!userDoc || !userDoc.password_hash) {
        throw new Error('Password update is not available for this account.');
    }

    const isMatch = await bcrypt.compare(currentPassword, userDoc.password_hash);
    if (!isMatch) {
        throw new Error('Current password is incorrect.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password_hash: hashedPassword });
};

/**
 * Resets a password directly by email address.
 * Used by the forgot-password flow where identity is already proven via OTP.
 */
export const resetPasswordByEmail = async (email, newPassword) => {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email }, { password_hash: hashedPassword });
};

export const applyPendingEmail = async (userId) => {
    const user = await User.findById(userId).select('pending_email email').lean();

    if (!user || !user.pending_email) {
        throw new Error('No pending email change found for this account.');
    }

    const conflict = await User.findOne({ email: user.pending_email, _id: { $ne: userId } });
    if (conflict) {
        throw new Error('This email address is already in use by another account.');
    }

    await User.findByIdAndUpdate(userId, {
        email: user.pending_email,
        pending_email: null,
    });

    return user.pending_email;
};

export const updateUserProfileImage = async(userId, imageUrl)=>{
    const updatedUser = await User.findByIdAndUpdate(
        userId,
        {profile_image: imageUrl},
        {new: true, lean: true}
    );

    if(!updatedUser){
        throw new Error('User record not found during asset allocation mapping.');
    }

    return updatedUser;
};