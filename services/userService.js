import User from '../models/User.js';
import bcrypt from 'bcrypt';
import OTP from '../models/Otpmodel.js';
import { sendEmail } from '../utils/emailSender.js';
import { uploadToCloudinary } from '../config/cloudinary.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,}$/;
export const registerLocalUser = async (username, email, password, referralCode) => {
    if (username && username.length > 50) {
        throw new Error('Username cannot exceed 50 characters.');
    }
    if (email && email.length > 100) {
        throw new Error('Email cannot exceed 100 characters.');
    }
    if (password && password.length > 128) {
        throw new Error('Password cannot exceed 128 characters.');
    }
    if (referralCode && referralCode.length > 50) {
        throw new Error('Referral code cannot exceed 50 characters.');
    }

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
        const existingOtp = await OTP.findOne({ email: userData.email, purpose: 'signup' });
        const hasValidOtp = existingOtp && existingOtp.expires_at > Date.now();
        if (!hasValidOtp) {
            await generateOTP(userData.email, 'signup');
        }
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

export const changePassword = async (userId, currentPassword, newPassword) => {
    if (newPassword && newPassword.length > 128) {
        throw new Error('Password cannot exceed 128 characters.');
    }

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

export const resetPasswordByEmail = async (email, newPassword) => {
    if (newPassword && newPassword.length > 128) {
        throw new Error('Password cannot exceed 128 characters.');
    }
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

export const checkAndSendForgotPasswordOtp = async (email) => {
    const existingOtp = await OTP.findOne({ email, purpose: 'forgot' });
    const hasValidOtp = existingOtp && existingOtp.expires_at > Date.now();
    if (!hasValidOtp) {
        await generateOTP(email, 'forgot');
        return { sentNew: true };
    }
    return { sentNew: false };
};

export const checkAndSendSignupOtp = async (email) => {
    const existingOtp = await OTP.findOne({ email, purpose: 'signup' });
    const hasValidOtp = existingOtp && existingOtp.expires_at > Date.now();
    if (!hasValidOtp) {
        await generateOTP(email, 'signup');
        return { sentNew: true };
    }
    return { sentNew: false };
};

export const getAdminByEmail = async (email) => {
    try {
        return await User.findOne({ email: email.toLowerCase().trim() });
    } catch (error) {
        console.error('[userService.getAdminByEmail] Error:', error);
        throw error;
    }
};

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

export const getUserProfile = async (userId) => {
    try {
        const user = await User.findById(userId).select('-password_hash').lean();
        if (!user) {
            return null;
        }

        const rawUser = await User.findById(userId).select('password_hash').lean();
        user.password_hash = rawUser?.password_hash ? true : null;

        return user;
    } catch (error) {
        console.error('[userService.getUserProfile] Error:', error);
        throw error;
    }
};

export const updateUserProfile = async (userId, { username, phone, email }, file) => {
    try {
        if (!username || !username.trim()) {
            throw new Error('Username cannot be empty.');
        }

        if (username && username.length > 50) {
            throw new Error('Username cannot exceed 50 characters.');
        }
        if (phone && phone.length > 15) {
            throw new Error('Phone number cannot exceed 15 characters.');
        }
        if (email && email.length > 100) {
            throw new Error('Email cannot exceed 100 characters.');
        }

        const currentUser = await User.findById(userId).select('email').lean();
        if (!currentUser) {
            throw new Error('User not found.');
        }

        if (phone && phone.trim()) {
            const cleanPhone = phone.replace(/[\s-]/g, '');
            const phoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
            if (!phoneRegex.test(cleanPhone)) {
                throw new Error('Please enter a valid phone number (10 to 12 digits, optional +91).');
            }
        }

        let profile_image_url = undefined;
        if (file) {
            const uploadResult = await uploadToCloudinary(file, 'pixelplay_uploads');
            profile_image_url = uploadResult.secure_url;
        }

        const updateFields = {
            username: username.trim(),
            phone: (phone && phone.trim()) ? phone.replace(/[\s-]/g, '') : null,
        };

        if (profile_image_url) {
            updateFields.profile_image = profile_image_url;
        }

        const submittedEmail = email?.trim().toLowerCase();
        if (submittedEmail && submittedEmail !== currentUser.email) {
            const conflict = await User.findOne({ email: submittedEmail });
            if (conflict) {
                throw new Error('This email address is already in use.');
            }

            await User.findByIdAndUpdate(
                userId,
                { ...updateFields, pending_email: submittedEmail },
                { runValidators: true }
            );

            await generateOTP(submittedEmail, 'email_update');
            return { emailChanged: true, pendingEmail: submittedEmail };
        }

        await User.findByIdAndUpdate(userId, updateFields, { runValidators: true });
        return { emailChanged: false };
    } catch (error) {
        console.error('[userService.updateUserProfile] Error:', error);
        throw error;
    }
};

export const getPendingEmail = async (userId) => {
    try {
        const user = await User.findById(userId).select('pending_email').lean();
        return user ? user.pending_email : null;
    } catch (error) {
        console.error('[userService.getPendingEmail] Error:', error);
        throw error;
    }
};

export const getAddresses = async (userId) => {
    try {
        const user = await User.findById(userId).select('addresses').lean();
        return user ? user.addresses : [];
    } catch (error) {
        console.error('[userService.getAddresses] Error:', error);
        throw error;
    }
};

export const addAddress = async (userId, { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault }) => {
    try {
        if (!fullName || !phone || !addressLine1 || !city || !state || !postal_code) {
            throw new Error('Please fill in all required fields.');
        }

        if (fullName && fullName.length > 100) {
            throw new Error('Full name cannot exceed 100 characters.');
        }
        if (phone && phone.length > 15) {
            throw new Error('Phone number cannot exceed 15 characters.');
        }
        if (addressLine1 && addressLine1.length > 200) {
            throw new Error('Address Line 1 cannot exceed 200 characters.');
        }
        if (addressLine2 && addressLine2.length > 200) {
            throw new Error('Address Line 2 cannot exceed 200 characters.');
        }
        if (city && city.length > 100) {
            throw new Error('City cannot exceed 100 characters.');
        }
        if (state && state.length > 100) {
            throw new Error('State cannot exceed 100 characters.');
        }
        if (country && country.length > 100) {
            throw new Error('Country cannot exceed 100 characters.');
        }
        if (address_type && address_type.length > 50) {
            throw new Error('Address type cannot exceed 50 characters.');
        }
        if (postal_code) {
            const pcStr = String(postal_code).trim();
            if (!/^\d{6}$/.test(pcStr)) {
                throw new Error('Postal code must be exactly 6 digits.');
            }
        }

        const cleanPhone = phone ? phone.replace(/[\s-]/g, '') : '';
        const phoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
        if (!phoneRegex.test(cleanPhone)) {
            throw new Error('Please enter a valid phone number (10 to 12 digits, optional +91).');
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        const isDuplicate = user.addresses.some(addr => 
            addr.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() &&
            addr.phone.trim() === phone.trim() &&
            addr.addressLine1.trim().toLowerCase() === addressLine1.trim().toLowerCase() &&
            (addr.addressLine2 || '').trim().toLowerCase() === (addressLine2 || '').trim().toLowerCase() &&
            addr.city.trim().toLowerCase() === city.trim().toLowerCase() &&
            addr.state.trim().toLowerCase() === state.trim().toLowerCase() &&
            addr.postal_code.trim() === String(postal_code).trim() &&
            addr.country.trim().toLowerCase() === (country || 'India').trim().toLowerCase() &&
            addr.address_type === (address_type || 'home')
        );

        if (isDuplicate) {
            throw new Error('This address already exists in your saved addresses.');
        }

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
            postal_code: String(postal_code).trim(),
            country: country?.trim() || 'India',
            address_type: address_type || 'home',
            isDefault: isDefault === 'true' || isDefault === true,
        });

        await user.save();
        return user;
    } catch (error) {
        console.error('[userService.addAddress] Error:', error);
        throw error;
    }
};

export const editAddress = async (userId, addressId, { fullName, phone, addressLine1, addressLine2, city, state, postal_code, country, address_type, isDefault }) => {
    try {
        if (!fullName || !phone || !addressLine1 || !city || !state || !postal_code) {
            throw new Error('Please fill in all required fields.');
        }

        if (fullName && fullName.length > 100) {
            throw new Error('Full name cannot exceed 100 characters.');
        }
        if (phone && phone.length > 15) {
            throw new Error('Phone number cannot exceed 15 characters.');
        }
        if (addressLine1 && addressLine1.length > 200) {
            throw new Error('Address Line 1 cannot exceed 200 characters.');
        }
        if (addressLine2 && addressLine2.length > 200) {
            throw new Error('Address Line 2 cannot exceed 200 characters.');
        }
        if (city && city.length > 100) {
            throw new Error('City cannot exceed 100 characters.');
        }
        if (state && state.length > 100) {
            throw new Error('State cannot exceed 100 characters.');
        }
        if (country && country.length > 100) {
            throw new Error('Country cannot exceed 100 characters.');
        }
        if (address_type && address_type.length > 50) {
            throw new Error('Address type cannot exceed 50 characters.');
        }
        if (postal_code) {
            const pcStr = String(postal_code).trim();
            if (!/^\d{6}$/.test(pcStr)) {
                throw new Error('Postal code must be exactly 6 digits.');
            }
        }

        const cleanPhone = phone ? phone.replace(/[\s-]/g, '') : '';
        const phoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
        if (!phoneRegex.test(cleanPhone)) {
            throw new Error('Please enter a valid phone number (10 to 12 digits, optional +91).');
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            throw new Error('Address not found.');
        }

        const isDuplicate = user.addresses.some(addr => 
            addr._id.toString() !== addressId &&
            addr.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() &&
            addr.phone.trim() === phone.trim() &&
            addr.addressLine1.trim().toLowerCase() === addressLine1.trim().toLowerCase() &&
            (addr.addressLine2 || '').trim().toLowerCase() === (addressLine2 || '').trim().toLowerCase() &&
            addr.city.trim().toLowerCase() === city.trim().toLowerCase() &&
            addr.state.trim().toLowerCase() === state.trim().toLowerCase() &&
            addr.postal_code.trim() === String(postal_code).trim() &&
            addr.country.trim().toLowerCase() === (country || 'India').trim().toLowerCase() &&
            addr.address_type === (address_type || 'home')
        );

        if (isDuplicate) {
            throw new Error('Another address with these details already exists.');
        }

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
            postal_code: String(postal_code).trim(),
            country: country?.trim() || 'India',
            address_type: address_type || 'home',
            isDefault: isDefault === 'true' || isDefault === true,
        });

        await user.save();
        return user;
    } catch (error) {
        console.error('[userService.editAddress] Error:', error);
        throw error;
    }
};

export const deleteAddress = async (userId, addressId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        const before = user.addresses.length;
        user.addresses.pull({ _id: addressId });

        if (user.addresses.length === before) {
            throw new Error('Address not found.');
        }

        await user.save();
        return user;
    } catch (error) {
        console.error('[userService.deleteAddress] Error:', error);
        throw error;
    }
};