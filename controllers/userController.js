import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Publisher from '../models/Publisher.js';
import Wishlist from '../models/Wishlist.js';
import Cart from '../models/Cart.js';
import * as userService from '../services/userService.js';
import * as categoryService from '../services/categoryService.js';
import * as productService from '../services/productService.js';
import * as cartService from '../services/cartService.js';
import * as orderService from '../services/orderService.js';
import * as invoiceService from '../services/invoiceService.js';
import { uploadToCloudinary } from '../config/cloudinary.js';

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

        const existingUser = await User.findOne({ email });
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


export const getHome = async (req, res) => {
    try {
        const categories = await categoryService.getAllActiveCategories();
        
        const primaryPlatform = req.session.primaryPlatform || 'PC';
        const allPlatforms = await Product.distinct('platforms');
        if (!allPlatforms.includes('PC')) {
            allPlatforms.unshift('PC');
        }

        const { latestRelease, standardGames, legendaryGames } = await productService.getProductsForHome(primaryPlatform);
        const activePublishers = await productService.getActivePublishersWithGameCount();

        const publishers = activePublishers;

        let userWishlist = [];

        if (req.session.user) {
            const userId = req.session.user.id || req.session.user;
            const user = await User.findById(userId)
                .select('-password_hash')
                .lean();

            if (!user || user.is_blocked) {
                req.session.destroy(() => {});
                return res.render('user/home', { 
                    user: null, 
                    categories, 
                    publishers,
                    latestRelease,
                    standardGames,
                    legendaryGames,
                    activePublishers,
                    userWishlist: [],
                    primaryPlatform,
                    allPlatforms
                });
            }

            const wishlist = await Wishlist.findOne({ userId });
            if (wishlist && wishlist.items) {
                userWishlist = wishlist.items.map(item => item.product.toString());
            }

            return res.render('user/home', { 
                user, 
                categories, 
                publishers,
                latestRelease,
                standardGames,
                legendaryGames,
                activePublishers,
                userWishlist,
                primaryPlatform,
                allPlatforms
            });
        }

        return res.render('user/home', { 
            user: null, 
            categories, 
            publishers,
            latestRelease,
            standardGames,
            legendaryGames,
            activePublishers,
            userWishlist: [],
            primaryPlatform,
            allPlatforms
        });
    } catch (error) {
        console.error('[getHome]', error);
        res.render('user/home', { 
            user: null, 
            categories: [], 
            publishers: [],
            latestRelease: null,
            standardGames: [],
            legendaryGames: [],
            activePublishers: [],
            userWishlist: []
        });
    }
};


export const getProfile = async (req, res) => {
    try {
        const rawUser = await User.findById(req.session.user).select('password_hash').lean();
        const user = await User.findById(req.session.user).select('-password_hash').lean();
        if (!user) return res.redirect('/auth/login');

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
        if (!user) return res.redirect('/auth/login');

        user.password_hash = rawUser?.password_hash ? true : null;
        res.render('user/profile-edit', { user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { username, phone, email, profile_image } = req.body;

        if (!username || !username.trim()) {
            return res.status(400).json({ success: false, message: 'Username cannot be empty.' });
        }

        const currentUser = await User.findById(req.session.user).select('email').lean();
        if (!currentUser) return res.redirect('/auth/login');

        const updateFields = {
            username: username.trim(),
            phone: phone?.trim() || null,
        };

        if (profile_image && profile_image.startsWith('data:image/')) {
            updateFields.profile_image = profile_image;
        }

        const submittedEmail = email?.trim().toLowerCase();
        if (submittedEmail && submittedEmail !== currentUser.email) {
            const conflict = await User.findOne({ email: submittedEmail });
            if (conflict) {
                return res.status(400).json({ success: false, message: 'This email address is already in use.' });
            }

            await User.findByIdAndUpdate(
                req.session.user,
                { ...updateFields, pending_email: submittedEmail },
                { runValidators: true }
            );

            await userService.generateOTP(submittedEmail, 'email_update');
            return res.redirect('/auth/verify-email-update');
        }

        await User.findByIdAndUpdate(req.session.user, updateFields, { runValidators: true });
        res.redirect('/auth/profile');
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const getVerifyEmailUpdate = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).select('pending_email').lean();
        if (!user || !user.pending_email) return res.redirect('/auth/profile/edit');

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.render('user/verify-email', { email: user.pending_email, purpose: 'email_update' });
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
            redirectUrl: '/auth/profile',
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};


export const getProfilePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.user).select('-password_hash').lean();
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
            redirectUrl: '/auth/profile'
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};


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

export const getBrowsePage = async (req, res) => {
    try {
        const { search, genre, platform, price, rating, publisher, sort, vault, page } = req.query;

        // Normalize array queries to ensure consistent rendering in EJS helpers
        const queryGenre = Array.isArray(genre) ? genre : (genre ? [genre] : []);
        const queryPlatform = Array.isArray(platform) ? platform : (platform ? [platform] : []);
        const queryPrice = Array.isArray(price) ? price : (price ? [price] : []);
        const queryRating = Array.isArray(rating) ? rating : (rating ? [rating] : []);
        const queryPublisher = Array.isArray(publisher) ? publisher : (publisher ? [publisher] : []);

        const filters = {
            genre: queryGenre,
            platform: queryPlatform,
            price: queryPrice,
            rating: queryRating,
            publisher: queryPublisher,
            vault: vault || 'all'
        };

        const primaryPlatform = req.session.primaryPlatform || 'PC';
        const result = await productService.getBrowseProductsAndFilters(
            search || '',
            filters,
            sort || 'Trending',
            page || 1,
            8,
            primaryPlatform
        );

        let user = null;
        let userWishlist = [];
        let userCartItems = [];
        if (req.session.user) {
            const userId = req.session.user.id || req.session.user;
            user = await User.findById(userId).select('-password_hash').lean();
            const wishlist = await Wishlist.findOne({ userId });
            if (wishlist) {
                userWishlist = wishlist.items.map(item => item.product.toString());
            }
            const cart = await Cart.findOne({ userId }).lean();
            if (cart && cart.items) {
                userCartItems = cart.items.map(item => ({
                    productId: item.product.toString(),
                    platform: item.platform,
                    quantity: item.quantity
                }));
            }
        }

        res.render('user/browse-games', {
            user,
            userWishlist,
            userCartItems,
            products: result.products,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            platforms: result.dbPlatforms,
            publishers: result.dbPublishers,
            categories: result.dbCategories,
            primaryPlatform,
            query: {
                search: search || '',
                genre: queryGenre,
                platform: queryPlatform,
                price: queryPrice,
                rating: queryRating,
                publisher: queryPublisher,
                sort: sort || 'Trending',
                vault: vault || 'all'
            }
        });
    } catch (error) {
        console.error('[getBrowsePage] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading products.'
        });
    }
};

export const getProductDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id).lean();
        if (!product || product.status === 'Hidden') {
            return res.redirect('/browse');
        }

        const Category = (await import('../models/Category.js')).default;
        let catObj = null;
        if (product.category) {
            if (mongoose.Types.ObjectId.isValid(product.category)) {
                catObj = await Category.findById(product.category).lean();
            } else {
                catObj = await Category.findOne({ name: product.category }).lean();
            }
        }
        product.categoryName = catObj ? catObj.name : 'N/A';
        const discount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
        product.categoryDiscount = discount;
        product.discountedPrice = discount > 0 ? Math.max(0, product.price - (product.price * (discount / 100))) : product.price;

        let user = null;
        let inWishlist = false;
        let wishlistPlatforms = [];
        if (req.session.user) {
            const userId = req.session.user.id || req.session.user;
            user = await User.findById(userId).select('-password_hash').lean();
            const wishlist = await Wishlist.findOne({ userId });
            if (wishlist) {
                wishlistPlatforms = wishlist.items
                    .filter(item => item.product.toString() === id.toString())
                    .map(item => (item.platform || 'PC').toLowerCase());
                inWishlist = wishlistPlatforms.length > 0;
            }
        }

        const reviews = [];
        const primaryPlatform = req.session.primaryPlatform || 'PC';
        const similarGames = await productService.getRecommendationsForProduct(product.category, product._id, primaryPlatform);

        res.render('user/game-details', {
            product,
            reviews,
            user,
            inWishlist,
            wishlistPlatforms,
            similarGames,
            primaryPlatform
        });
    } catch (error) {
        console.error('[getProductDetails] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading game details.'
        });
    }
};

export const checkProductStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id).lean();
        if (!product || product.status === 'Hidden') {
            return res.status(200).json({ status: 'Hidden', redirectUrl: '/browse' });
        }
        return res.status(200).json({ status: 'Live' });
    } catch (error) {
        console.error('[checkProductStatus] Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await User.findById(userId).select('-password_hash').lean();
        if (!user) return res.redirect('/auth/login');

        let wishlist = await Wishlist.findOne({ userId }).populate('items.product').lean();
        if (!wishlist) {
            wishlist = { items: [] };
        } else {
            const CategoryModel = (await import('../models/Category.js')).default;
            for (let item of wishlist.items) {
                if (item.product) {
                    item.product = { ...item.product };
                    let catObj = null;
                    if (item.product.category) {
                        if (mongoose.Types.ObjectId.isValid(item.product.category)) {
                            catObj = await CategoryModel.findById(item.product.category).lean();
                        } else {
                            catObj = await CategoryModel.findOne({ name: item.product.category }).lean();
                        }
                    }
                    const discount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
                    item.product.categoryDiscount = discount;
                    
                    let basePrice = item.product.price || 0;
                    if (item.product.platform_stock && item.product.platform_stock.length > 0) {
                        const platStock = item.product.platform_stock.find(ps => ps.platform === item.platform);
                        if (platStock && typeof platStock.price === 'number') {
                            basePrice = platStock.price;
                        } else {
                            const firstPlat = item.product.platform_stock[0];
                            if (firstPlat && typeof firstPlat.price === 'number') {
                                basePrice = firstPlat.price;
                            }
                        }
                    }
                    
                    item.product.price = basePrice;
                    item.product.discountedPrice = discount > 0 ? Math.max(0, basePrice - (basePrice * (discount / 100))) : basePrice;
                    item.product.categoryName = catObj ? catObj.name : 'N/A';
                }
            }
        }

        res.render('user/wishlist', {
            user,
            wishlist
        });
    } catch (error) {
        console.error('[getWishlist] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading wishlist.'
        });
    }
};

export const toggleWishlist = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required.' });
        }

        const product = await Product.findById(productId).lean();
        if (!product || product.status === 'Hidden') {
            return res.status(400).json({ success: false, redirectUrl: '/browse', message: 'This product is currently unavailable.' });
        }

        let selectedPlatform = platform;
        if (!selectedPlatform) {
            selectedPlatform = (product.platforms && product.platforms.length > 0) ? product.platforms[0] : 'PC';
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        } else {
            wishlist.items.forEach(item => {
                if (!item.platform) {
                    item.platform = 'PC';
                }
            });
        }

        const itemIndex = wishlist.items.findIndex(item => 
            item.product.toString() === productId.toString() &&
            item.platform.toLowerCase() === selectedPlatform.toLowerCase()
        );
        let added = false;
        if (itemIndex > -1) {
            wishlist.items.splice(itemIndex, 1);
        } else {
            wishlist.items.push({ product: productId, platform: selectedPlatform });
            added = true;
        }

        await wishlist.save();
        res.status(200).json({ success: true, added });
    } catch (error) {
        console.error('[toggleWishlist] Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const getCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await User.findById(userId).select('-password_hash').lean();
        if (!user) return res.redirect('/auth/login');

        const {
            cart,
            subtotal,
            tax,
            shipping,
            grandTotal,
            hasUnavailableProduct
        } = await cartService.getCartDetails(userId);

        res.render('user/cart', {
            user,
            cart,
            subtotal,
            tax,
            shipping,
            grandTotal,
            hasUnavailableProduct
        });
    } catch (error) {
        console.error('[getCart] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading your cart.'
        });
    }
};

export const getCheckout = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await User.findById(userId).lean();
        if (!user) return res.redirect('/auth/login');

        const cartDetails = await cartService.getCartDetails(userId);

        if (!cartDetails.cart || !cartDetails.cart.items || cartDetails.cart.items.length === 0) {
            return res.redirect('/auth/cart');
        }

        if (cartDetails.hasUnavailableProduct) {
            return res.redirect('/auth/cart');
        }

        res.render('user/checkout', {
            user,
            cart: {
                items: cartDetails.cart.items,
                subtotal: cartDetails.subtotal,
                tax: cartDetails.tax,
                shipping: cartDetails.shipping,
                discount: cartDetails.discount,
                grandTotal: cartDetails.grandTotal
            }
        });
    } catch (error) {
        console.error('[getCheckout] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading checkout.'
        });
    }
};

export const addToCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform, quantity } = req.body;
        if (!productId || !platform) {
            return res.status(400).json({ success: false, message: 'Product ID and Platform are required.' });
        }

        const product = await Product.findById(productId);
        if (!product || product.status === 'Hidden') {
            return res.status(400).json({ success: false, redirectUrl: '/browse', message: 'This product is currently unavailable.' });
        }

        const qty = Number(quantity) || 1;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString() && 
            (item.platform || 'PC').toLowerCase() === platform.toLowerCase()
        );

        if (itemIndex > -1) {
            const newQty = cart.items[itemIndex].quantity + qty;
            if (newQty > 3) {
                return res.status(400).json({ success: false, message: 'Maximum of 3 should be the limit to add to cart.' });
            }
            if (newQty > product.stock) {
                return res.status(400).json({ success: false, message: `Only ${product.stock} items available in stock.` });
            }
            cart.items[itemIndex].quantity = newQty;
        } else {
            if (qty > 3) {
                return res.status(400).json({ success: false, message: 'Maximum of 3 should be the limit to add to cart.' });
            }
            if (qty > product.stock) {
                return res.status(400).json({ success: false, message: `Only ${product.stock} items available in stock.` });
            }
            cart.items.push({ product: productId, platform, quantity: qty });
        }

        await cart.save();
        const cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);

        // Remove from wishlist if it exists there
        let wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            wishlist.items.forEach(item => {
                if (!item.platform) {
                    item.platform = 'PC';
                }
            });
            const wlIndex = wishlist.items.findIndex(item => 
                item.product.toString() === productId.toString() &&
                item.platform.toLowerCase() === platform.toLowerCase()
            );
            if (wlIndex > -1) {
                wishlist.items.splice(wlIndex, 1);
                await wishlist.save();
            }
        }

        res.status(200).json({ success: true, cartCount });
    } catch (error) {
        console.error('[addToCart] Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const updateCartQuantity = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform, action } = req.body;
        if (!productId || !platform || !action) {
            return res.status(400).json({ success: false, message: 'Product ID, Platform, and Action are required.' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found.' });
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString() && 
            (item.platform || 'PC').toLowerCase() === platform.toLowerCase()
        );

        if (itemIndex > -1) {
            const product = await Product.findById(productId);
            if (!product || product.status === 'Hidden') {
                return res.status(400).json({ success: false, message: 'Product is currently unavailable.' });
            }

            if (action === 'increase') {
                const currentQty = cart.items[itemIndex].quantity;
                if (currentQty >= 3) {
                    return res.status(400).json({ success: false, message: 'Maximum of 3 should be the limit to add to cart.' });
                }
                if (currentQty >= product.stock) {
                    return res.status(400).json({ success: false, message: `Only ${product.stock} items available in stock.` });
                }
                cart.items[itemIndex].quantity += 1;
            } else if (action === 'decrease') {
                if (cart.items[itemIndex].quantity > 1) {
                    cart.items[itemIndex].quantity -= 1;
                } else {
                    return res.status(400).json({ success: false, message: 'Minimum quantity limit reached.' });
                }
            }
            await cart.save();

            const cartDetails = await cartService.getCartDetails(userId);
            const itemsData = cartDetails.cart.items.map(item => {
                const itemSubtotal = item.product.price * item.quantity;
                return {
                    productId: item.product._id.toString(),
                    platform: item.platform || 'PC',
                    quantity: item.quantity,
                    price: item.product.price,
                    displayPrice: item.product.displayPrice,
                    itemSubtotal: itemSubtotal,
                    isMinQty: item.quantity <= 1,
                    isMaxQty: item.quantity >= 3 || item.quantity >= item.product.stock,
                    stock: item.product.stock
                };
            });

            const cartCount = cartDetails.cart.items.reduce((acc, item) => acc + item.quantity, 0);

            return res.status(200).json({
                success: true,
                cartCount,
                subtotal: cartDetails.subtotal,
                tax: cartDetails.tax,
                shipping: cartDetails.shipping,
                grandTotal: cartDetails.grandTotal,
                hasUnavailableProduct: cartDetails.hasUnavailableProduct,
                items: itemsData
            });
        }

        res.status(404).json({ success: false, message: 'Item not found in cart.' });
    } catch (error) {
        console.error('[updateCartQuantity] Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform } = req.body;
        if (!productId || !platform) {
            return res.status(400).json({ success: false, message: 'Product ID and Platform are required.' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found.' });
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString() && 
            (item.platform || 'PC').toLowerCase() === platform.toLowerCase()
        );

        if (itemIndex > -1) {
            cart.items.splice(itemIndex, 1);
            await cart.save();
            const cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
            return res.status(200).json({ success: true, cartCount });
        }

        res.status(404).json({ success: false, message: 'Item not found in cart.' });
    } catch (error) {
        console.error('[removeFromCart] Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const setPrimaryPlatform = async (req, res) => {
    try {
        const { platform } = req.body;
        if (platform) {
            req.session.primaryPlatform = platform;
        }
        return res.redirect(req.headers.referer || '/home');
    } catch (error) {
        console.error('[setPrimaryPlatform] Error:', error);
        return res.redirect('/home');
    }
};

export const postPlaceOrder = async (req, res) => {
    try {
        const { paymentMethod, addressId } = req.body;
        const userId = req.session.user.id || req.session.user;

        if (!paymentMethod || !addressId) {
            return res.status(400).json({ success: false, message: 'Payment method and address are required.' });
        }

        const order = await orderService.placeOrder(userId, paymentMethod, addressId);
        
        res.status(201).json({
            success: true,
            message: 'Order placed successfully.',
            orderId: order._id
        });
    } catch (error) {
        console.error('[postPlaceOrder] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await orderService.getOrderById(orderId);
        
        const loggedInUserId = req.session.user.id || req.session.user;
        if (!order || order.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/home');
        }

        res.render('user/order-success', { order });
    } catch (error) {
        console.error('[getOrderSuccess] Error:', error);
        res.redirect('/home');
    }
};

export const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await User.findById(loggedInUserId).lean();
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/home');
        }

        const cart = await Cart.findOne({ userId: loggedInUserId });
        const cartCount = cart ? cart.items.reduce((acc, item) => acc + item.quantity, 0) : 0;

        let mappedStatus = dbOrder.orderStatus || 'Processing';
        if (mappedStatus.toUpperCase() === 'PENDING') {
            mappedStatus = 'Processing';
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: mappedStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items,
            cancellationDate: dbOrder.cancellationDate,
            cancellationReason: dbOrder.cancellationReason,
            cancellationComments: dbOrder.cancellationComments
        };

        res.render('user/order-details', { order: mappedOrder, user, cartCount });
    } catch (error) {
        console.error('[getOrderDetails] Error:', error);
        res.redirect('/home');
    }
};

export const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await User.findById(userId).lean();
        if (!user) return res.redirect('/auth/login');

        const limit = 5;
        const page = parseInt(req.query.page) || 1;
        const sort = req.query.sort || 'newest';
        const filter = req.query.filter || 'All';
        const viewType = req.query.viewType || 'orders';

        const result = await orderService.getOrdersByUserPaginated(userId, page, limit, sort, filter, viewType);
        const { totalPages, currentPage } = result;

        const cart = await Cart.findOne({ userId });
        const cartCount = cart ? cart.items.reduce((acc, item) => acc + item.quantity, 0) : 0;

        let mappedOrders = [];
        let paginatedItems = [];

        if (viewType === 'items') {
            paginatedItems = result.items;
        } else {
            mappedOrders = result.orders.map(order => {
                let mappedStatus = order.orderStatus || 'Processing';
                if (mappedStatus.toUpperCase() === 'PENDING') {
                    mappedStatus = 'Processing';
                }
                return {
                    ...order,
                    status: mappedStatus
                };
            });
        }

        res.render('user/order-history', {
            user,
            orders: mappedOrders,
            items: paginatedItems,
            currentPage,
            totalPages,
            sort,
            filter,
            viewType,
            cartCount
        });
    } catch (error) {
        console.error('[getOrderHistory] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading order history.'
        });
    }
};

export const getCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await User.findById(loggedInUserId).lean();
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/auth/orders');
        }

        if (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending') {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cart = await Cart.findOne({ userId: loggedInUserId });
        const cartCount = cart ? cart.items.reduce((acc, item) => acc + item.quantity, 0) : 0;

        let mappedStatus = dbOrder.orderStatus || 'Processing';
        if (mappedStatus.toUpperCase() === 'PENDING') {
            mappedStatus = 'Processing';
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: mappedStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items
        };

        res.render('user/order-cancel', { order: mappedOrder, user, cartCount, product: null, item: null, error: req.query.error || null });
    } catch (error) {
        console.error('[getCancelOrder] Error:', error);
        res.redirect('/auth/orders');
    }
};

export const postCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cancel_reason, additional_comments } = req.body;

        if (!cancel_reason) {
            return res.redirect(`/user/orders/cancel/${orderId}?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/user/orders/cancel/${orderId}?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/user/orders/cancel/${orderId}?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelOrder(orderId, loggedInUserId, cancel_reason, additional_comments);

        res.redirect(`/user/orders/${orderId}?notification=Order cancelled successfully`);
    } catch (error) {
        console.error('[postCancelOrder] Error:', error);
        res.redirect('/auth/orders');
    }
};

export const getCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await User.findById(loggedInUserId).lean();
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/auth/orders');
        }

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform));
        if (!item) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        if (item.status === 'Cancelled' || (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending')) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cart = await Cart.findOne({ userId: loggedInUserId });
        const cartCount = cart ? cart.items.reduce((acc, item) => acc + item.quantity, 0) : 0;

        let mappedStatus = dbOrder.orderStatus || 'Processing';
        if (mappedStatus.toUpperCase() === 'PENDING') {
            mappedStatus = 'Processing';
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: mappedStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount,
            items: dbOrder.items
        };

        res.render('user/order-cancel', {
            order: mappedOrder,
            product: item.product,
            item: item,
            user,
            cartCount,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('[getCancelItem] Error:', error);
        res.redirect('/auth/orders');
    }
};

export const postCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { cancel_reason, additional_comments, quantity } = req.body;
        const cancelQty = parseInt(quantity, 10) || 1;

        if (!cancel_reason) {
            return res.redirect(`/user/orders/cancel/${orderId}/${productId}?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/user/orders/cancel/${orderId}/${productId}?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/user/orders/cancel/${orderId}/${productId}?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelItem(orderId, loggedInUserId, productId, cancel_reason, additional_comments, cancelQty, platform);

        res.redirect(`/user/orders/${orderId}?notification=Item cancelled successfully`);
    } catch (error) {
        console.error('[postCancelItem] Error:', error);
        res.redirect('/auth/orders');
    }
};

export const getReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await User.findById(loggedInUserId).lean();
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/auth/orders');
        }

        if (dbOrder.orderStatus !== 'Delivered' && dbOrder.orderStatus !== 'Return Requested' && dbOrder.orderStatus !== 'Returned') {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cart = await Cart.findOne({ userId: loggedInUserId });
        const cartCount = cart ? cart.items.reduce((acc, item) => acc + item.quantity, 0) : 0;

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform) && (i.status === 'Ordered' || !i.status));
        if (!item) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const mappedOrder = {
            _id: dbOrder._id,
            orderId: dbOrder.orderId,
            createdAt: dbOrder.createdAt,
            status: dbOrder.orderStatus,
            address: dbOrder.deliveryAddress,
            paymentMethod: dbOrder.paymentMethod,
            subtotal: dbOrder.subtotal,
            couponDiscount: dbOrder.discount,
            tax: dbOrder.tax,
            shipping: dbOrder.shipping,
            grandTotal: dbOrder.finalAmount
        };

        res.render('user/order-return', {
            order: mappedOrder,
            product: item.product,
            item: item,
            user,
            cartCount,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('[getReturnOrder] Error:', error);
        res.redirect('/auth/orders');
    }
};

export const postReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { return_reason, additional_details, quantity } = req.body;
        const returnQty = parseInt(quantity, 10) || 1;

        if (!return_reason) {
            return res.redirect(`/user/orders/return/${orderId}/${productId}?error=Return reason is required`);
        }
        if (return_reason === 'other' && (!additional_details || additional_details.trim().length < 10)) {
            return res.redirect(`/user/orders/return/${orderId}/${productId}?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_details && additional_details.trim().length > 100) {
            return res.redirect(`/user/orders/return/${orderId}/${productId}?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.requestItemReturn(orderId, loggedInUserId, productId, return_reason, additional_details, returnQty, platform);

        res.redirect(`/user/orders/${orderId}?notification=Return requested successfully`);
    } catch (error) {
        console.error('[postReturnOrder] Error:', error);
        res.redirect('/auth/orders');
    }
};

export const downloadInvoice = async (req, res) => {
    const { orderId } = req.params;
    try {
        const loggedInUserId = req.session.user.id || req.session.user;

        // Set response headers to force download the PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${orderId}.pdf`);

        await invoiceService.generateInvoicePDF(orderId, loggedInUserId, res);
    } catch (error) {
        console.error('[downloadInvoice] Error:', error);
        if (error.message === 'Order not found' || error.message === 'Unauthorized access') {
            res.redirect('/auth/orders');
        } else {
            res.redirect(`/user/orders/${orderId}?error=${encodeURIComponent(error.message)}`);
        }
    }
};