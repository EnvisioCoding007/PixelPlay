import * as userService from '../services/userService.js';
import * as categoryService from '../services/categoryService.js';
import * as productService from '../services/productService.js';
import * as cartService from '../services/cartService.js';
import * as wishlistService from '../services/wishlistService.js';
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

export const getHome = async (req, res) => {
    try {
        const categories = await categoryService.getAllActiveCategories();
        
        const primaryPlatform = req.session.primaryPlatform || 'PC';
        const allPlatforms = await productService.getDistinctPlatforms();
        if (!allPlatforms.includes('PC')) {
            allPlatforms.unshift('PC');
        }

        const { latestRelease, standardGames, legendaryGames } = await productService.getProductsForHome(primaryPlatform);
        const activePublishers = await productService.getActivePublishersWithGameCount();

        const publishers = activePublishers;

        let userWishlist = [];

        if (req.session.user) {
            const userId = req.session.user.id || req.session.user;
            const user = await userService.getUserById(userId);

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

            userWishlist = await wishlistService.getWishlistItems(userId);

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
        const { username, phone, email, profile_image } = req.body;
        const userId = req.session.user.id || req.session.user;

        const result = await userService.updateUserProfile(userId, { username, phone, email, profile_image });
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

export const getBrowsePage = async (req, res) => {
    try {
        const { search, genre, platform, price, rating, publisher, sort, vault, page, notification } = req.query;

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
            user = await userService.getUserById(userId);
            userWishlist = await wishlistService.getWishlistItems(userId);
            userCartItems = await cartService.getCartItems(userId);
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
            notification: notification || null,
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
        const userId = req.session.user ? (req.session.user.id || req.session.user) : null;
        const primaryPlatform = req.session.primaryPlatform || 'PC';

        const details = await productService.getProductDetailsForUser(id, userId, primaryPlatform);
        if (!details) {
            return res.redirect('/browse?notification=The game was unlisted by the admin.');
        }

        const reviews = [];

        res.render('user/game-details', {
            product: details.product,
            reviews,
            user: details.user,
            inWishlist: details.inWishlist,
            wishlistPlatforms: details.wishlistPlatforms,
            similarGames: details.similarGames,
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
        const status = await productService.getProductStatus(id);
        if (!status || status === 'Hidden') {
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
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const wishlist = await wishlistService.getWishlistByUserId(userId);

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

        const result = await wishlistService.toggleWishlist(userId, productId, platform);
        res.status(200).json({ success: true, added: result.added });
    } catch (error) {
        console.error('[toggleWishlist] Error:', error);
        if (error.redirectUrl) {
            return res.status(400).json({ success: false, redirectUrl: error.redirectUrl, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const getCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(userId);
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
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const cartDetails = await cartService.getCartDetails(userId);

        if (!cartDetails.cart || !cartDetails.cart.items || cartDetails.cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        if (cartDetails.hasUnavailableProduct) {
            return res.redirect('/user/cart');
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

        const result = await cartService.addToCart(userId, productId, platform, quantity);
        res.status(200).json({ success: true, cartCount: result.cartCount });
    } catch (error) {
        console.error('[addToCart] Error:', error);
        if (error.redirectUrl) {
            return res.status(400).json({ success: false, redirectUrl: error.redirectUrl, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateCartQuantity = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform, action } = req.body;
        if (!productId || !platform || !action) {
            return res.status(400).json({ success: false, message: 'Product ID, Platform, and Action are required.' });
        }

        const result = await cartService.updateCartQuantity(userId, productId, platform, action);
        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[updateCartQuantity] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.session.user.id || req.session.user;
        const { productId, platform } = req.body;
        if (!productId || !platform) {
            return res.status(400).json({ success: false, message: 'Product ID and Platform are required.' });
        }

        const result = await cartService.removeFromCart(userId, productId, platform);
        return res.status(200).json({ success: true, cartCount: result.cartCount });
    } catch (error) {
        console.error('[removeFromCart] Error:', error);
        res.status(400).json({ success: false, message: error.message });
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
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/home');
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

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
        const user = await userService.getUserById(userId);
        if (!user) return res.redirect('/auth/login');

        const limit = 5;
        const page = parseInt(req.query.page) || 1;
        const sort = req.query.sort || 'newest';
        const filter = req.query.filter || 'All';
        const viewType = req.query.viewType || 'orders';

        const result = await orderService.getOrdersByUserPaginated(userId, page, limit, sort, filter, viewType);
        const { totalPages, currentPage } = result;

        const cartCount = await cartService.getCartItemCount(userId);

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
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/user/orders');
        }

        if (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending') {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

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
        res.redirect('/user/orders');
    }
};

export const postCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cancel_reason, additional_comments } = req.body;

        if (!cancel_reason) {
            return res.redirect(`/user/orders/${orderId}/cancellation?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/user/orders/${orderId}/cancellation?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/user/orders/${orderId}/cancellation?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelOrder(orderId, loggedInUserId, cancel_reason, additional_comments);

        res.redirect(`/user/orders/${orderId}?notification=Order cancelled successfully`);
    } catch (error) {
        console.error('[postCancelOrder] Error:', error);
        res.redirect('/user/orders');
    }
};

export const getCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/user/orders');
        }

        const item = dbOrder.items.find(i => i.product._id.toString() === productId.toString() && (!platform || i.platform === platform));
        if (!item) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        if (item.status === 'Cancelled' || (dbOrder.orderStatus !== 'Processing' && dbOrder.orderStatus !== 'Pending')) {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

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
        res.redirect('/user/orders');
    }
};

export const postCancelItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { cancel_reason, additional_comments, quantity } = req.body;
        const cancelQty = parseInt(quantity, 10) || 1;

        if (!cancel_reason) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/cancellation?error=Cancellation reason is required`);
        }
        if (cancel_reason === 'Other reason' && (!additional_comments || additional_comments.trim().length < 10)) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/cancellation?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_comments && additional_comments.trim().length > 100) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/cancellation?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.cancelItem(orderId, loggedInUserId, productId, cancel_reason, additional_comments, cancelQty, platform);

        res.redirect(`/user/orders/${orderId}?notification=Item cancelled successfully`);
    } catch (error) {
        console.error('[postCancelItem] Error:', error);
        res.redirect('/user/orders');
    }
};

export const getReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const dbOrder = await orderService.getOrderById(orderId);

        const loggedInUserId = req.session.user.id || req.session.user;
        const user = await userService.getUserById(loggedInUserId);
        if (!dbOrder || dbOrder.userId.toString() !== loggedInUserId.toString()) {
            return res.redirect('/user/orders');
        }

        if (dbOrder.orderStatus !== 'Delivered' && dbOrder.orderStatus !== 'Return Requested' && dbOrder.orderStatus !== 'Returned') {
            return res.redirect(`/user/orders/${orderId}`);
        }

        const cartCount = await cartService.getCartItemCount(loggedInUserId);

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
        res.redirect('/user/orders');
    }
};

export const postReturnOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { return_reason, additional_details, quantity } = req.body;
        const returnQty = parseInt(quantity, 10) || 1;

        if (!return_reason) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/returns?error=Return reason is required`);
        }
        if (return_reason === 'other' && (!additional_details || additional_details.trim().length < 10)) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/returns?error=Additional comments must be at least 10 characters long for "Other reason"`);
        }
        if (additional_details && additional_details.trim().length > 100) {
            return res.redirect(`/user/orders/${orderId}/items/${productId}/returns?error=Additional comments cannot exceed 100 characters`);
        }

        const loggedInUserId = req.session.user.id || req.session.user;

        await orderService.requestItemReturn(orderId, loggedInUserId, productId, return_reason, additional_details, returnQty, platform);

        res.redirect(`/user/orders/${orderId}?notification=Return requested successfully`);
    } catch (error) {
        console.error('[postReturnOrder] Error:', error);
        res.redirect('/user/orders');
    }
};

export const downloadInvoice = async (req, res) => {
    const { orderId } = req.params;
    try {
        const loggedInUserId = req.session.user.id || req.session.user;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${orderId}.pdf`);

        await invoiceService.generateInvoicePDF(orderId, loggedInUserId, res);
    } catch (error) {
        console.error('[downloadInvoice] Error:', error);
        if (error.message === 'Order not found' || error.message === 'Unauthorized access') {
            res.redirect('/user/orders');
        } else {
            res.redirect(`/user/orders/${orderId}?error=${encodeURIComponent(error.message)}`);
        }
    }
};