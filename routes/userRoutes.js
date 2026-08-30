import { isUserAuth, isUserUnAuth, handleGoogleAuth } from '../middleware/auth.js';
import express from 'express';
import passport from 'passport';
import { upload } from '../config/cloudinary.js';

import * as authController from '../controllers/user/authController.js';
import * as userController from '../controllers/user/userController.js';
import * as productController from '../controllers/user/productController.js';
import * as wishlistController from '../controllers/user/wishlistController.js';
import * as cartController from '../controllers/user/cartController.js';
import * as orderController from '../controllers/user/orderController.js';
import * as walletController from '../controllers/user/walletController.js';
import * as supportController from '../controllers/user/supportController.js';
import * as notificationController from '../controllers/user/notificationController.js';
import * as reviewController from '../controllers/user/reviewController.js';

const router = express.Router();

// ==========================================
// 1. PUBLIC BLOCK (Unprotected Routes)
// ==========================================
router.get('/', productController.getHome);
router.get('/home', productController.getHome);
router.get('/browse', productController.getBrowsePage);
router.get('/offers', productController.getOffersPage);
router.get('/products/status/:id', productController.checkProductStatus);
router.get('/products/:id', productController.getProductDetails);

// Support Routes
router.get('/support', supportController.getSupportPage);
router.post('/support', supportController.submitSupportRequest);

// ==========================================
// 2. GUEST BLOCK (Unauthenticated User Routes)
// ==========================================
router.use([
    '/signup',
    '/login',
    '/send-otp',
    '/verify-email',
    '/forgot-password',
    '/reset-password-otp',
    '/reset-password',
    '/auth/google'
], isUserUnAuth);

router.get('/signup', authController.getSignupPage);
router.post('/signup', authController.signup);
router.post('/send-otp', authController.sendVerificationOtp);
router.get('/verify-email', authController.getVerifyEmailPage);
router.post('/verify-email', authController.verifyOtp);

router.get('/login', authController.getLogin);
router.post('/login', authController.login);

router.get('/reset-password-otp', authController.resetPasswordOtpPage);
router.post('/reset-password-otp', authController.verifyForgotPasswordOtp);

router.get('/forgot-password', authController.getForgetPasswordPage);
router.post('/forgot-password', authController.forgotPasswordOtp);

router.get('/reset-password', authController.getResetPasswordPage);
router.post('/reset-password', authController.resetPassword);

router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));
router.get('/auth/google/callback', handleGoogleAuth);

// ==========================================
// 3. PROTECTED BLOCK (Authenticated User Routes)
// ==========================================
router.use((req, res, next) => {
    if (req.path.startsWith('/admin')) return next('router');
    next();
});
router.use(isUserAuth);

// Profile & Settings
router.patch('/profile/primary-platform', productController.setPrimaryPlatform);
router.get('/profile', userController.getProfile);
router.get('/profile/edit', userController.getProfileEdit);
router.patch('/profile', upload.single('profile_image'), userController.updateProfile);
router.get('/verify-email-update', userController.getVerifyEmailUpdate);
router.post('/verify-email-update', userController.verifyEmailUpdate);
router.get('/profile/password', userController.getProfilePassword);
router.patch('/profile/password', userController.updatePassword);
router.get('/profile/addresses', userController.getAddresses);
router.post('/profile/addresses', userController.addAddress);
router.patch('/profile/addresses/:addressId', userController.editAddress);
router.delete('/profile/addresses/:addressId', userController.deleteAddress);

// Product Reviews & Ratings
router.post('/products/:id/reviews', reviewController.postReview);
router.delete('/products/:id/reviews/:reviewId', reviewController.deleteReview);
router.get('/products/:id/reviews/eligibility', reviewController.checkEligibility);

// Wishlist
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist', wishlistController.toggleWishlist);
router.post('/wishlist/toggle', wishlistController.toggleWishlist);

// Cart & Checkout
router.get('/cart', cartController.getCart);
router.post('/cart', cartController.addToCart);
router.patch('/cart', cartController.updateCartQuantity);
router.delete('/cart', cartController.removeFromCart);
router.get('/checkout', cartController.getCheckout);
router.get('/checkout/failure', cartController.getCheckoutFailure);
router.post('/cart/apply-coupon', cartController.applyCoupon);
router.post('/cart/remove-coupon', cartController.removeCoupon);

// Wallet
router.get('/wallet', walletController.getWalletPage);
router.post('/wallet/add-funds', walletController.addFunds);
router.post('/wallet/razorpay-create', walletController.createWalletRazorpayOrder);
router.post('/wallet/razorpay-verify', walletController.verifyWalletRazorpayPayment);

// Orders
router.post('/orders', orderController.postPlaceOrder);
router.post('/orders/razorpay-create', orderController.createRazorpayOrder);
router.post('/orders/razorpay-verify', orderController.verifyRazorpayPayment);
router.get('/orders/success/:orderId', orderController.getOrderSuccess);
router.get('/orders/:orderId', orderController.getOrderDetails);
router.get('/orders/:orderId/invoice', orderController.downloadInvoice);
router.get('/orders/:orderId/cancellation', orderController.getCancelOrder);
router.delete('/orders/:orderId', orderController.postCancelOrder);
router.get('/orders/:orderId/items/:productId/cancellation', orderController.getCancelItem);
router.delete('/orders/:orderId/items/:productId', orderController.postCancelItem);
router.get('/orders/:orderId/items/:productId/returns', orderController.getReturnOrder);
router.post('/orders/:orderId/items/:productId/returns', orderController.postReturnOrder);
router.get('/orders/:orderId/returns', orderController.getEntireOrderReturn);
router.post('/orders/:orderId/returns', orderController.postEntireOrderReturn);
router.get('/orders', orderController.getOrderHistory);

// Notifications
router.get('/notifications', notificationController.getNotifications);
router.patch('/notifications/read-all', notificationController.markAllAsRead);
router.patch('/notifications/:id/read', notificationController.markAsRead);
router.delete('/notifications/read', notificationController.deleteReadNotifications);
router.delete('/notifications/:id', notificationController.deleteNotification);

// Logout
router.post('/logout', authController.logout);

export default router;