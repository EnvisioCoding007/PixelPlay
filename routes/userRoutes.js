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

router.get('/signup', isUserUnAuth, authController.getSignupPage);
router.post('/signup', authController.signup);
router.post('/send-otp', authController.sendVerificationOtp);
router.get('/verify-email', isUserUnAuth, authController.getVerifyEmailPage);
router.post('/verify-email', authController.verifyOtp);

router.get('/login', isUserUnAuth, authController.getLogin);
router.post('/login', authController.login);

router.get('/reset-password-otp', isUserUnAuth, authController.resetPasswordOtpPage);
router.post('/reset-password-otp', isUserUnAuth, authController.verifyForgotPasswordOtp);

router.get('/forgot-password', isUserUnAuth, authController.getForgetPasswordPage);
router.post('/forgot-password', isUserUnAuth, authController.forgotPasswordOtp);

router.get('/reset-password', authController.getResetPasswordPage);
router.post('/reset-password', authController.resetPassword);

router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));
router.get('/auth/google/callback', handleGoogleAuth);

router.get('/', productController.getHome);
router.patch('/profile/primary-platform', productController.setPrimaryPlatform);
router.get('/home', productController.getHome);

router.get('/browse', productController.getBrowsePage);
router.get('/offers', productController.getOffersPage);
router.get('/products/:id', productController.getProductDetails);
router.get('/products/status/:id', productController.checkProductStatus);

// Review & Rating Routes
router.post('/products/:id/reviews', isUserAuth, reviewController.postReview);
router.delete('/products/:id/reviews/:reviewId', isUserAuth, reviewController.deleteReview);
router.get('/products/:id/reviews/eligibility', isUserAuth, reviewController.checkEligibility);

router.get('/profile', isUserAuth, userController.getProfile);
router.get('/wishlist', isUserAuth, wishlistController.getWishlist);
router.post('/wishlist', isUserAuth, wishlistController.toggleWishlist);
router.post('/wishlist/toggle', isUserAuth, wishlistController.toggleWishlist);

router.get('/cart', isUserAuth, cartController.getCart);
router.post('/cart', isUserAuth, cartController.addToCart);
router.patch('/cart', isUserAuth, cartController.updateCartQuantity);
router.delete('/cart', isUserAuth, cartController.removeFromCart);
router.get('/checkout', isUserAuth, cartController.getCheckout);
router.post('/cart/apply-coupon', isUserAuth, cartController.applyCoupon);
router.post('/cart/remove-coupon', isUserAuth, cartController.removeCoupon);

router.get('/wallet', isUserAuth, walletController.getWalletPage);
router.post('/wallet/add-funds', isUserAuth, walletController.addFunds);
router.post('/wallet/razorpay-create', isUserAuth, walletController.createWalletRazorpayOrder);
router.post('/wallet/razorpay-verify', isUserAuth, walletController.verifyWalletRazorpayPayment);

router.post('/orders', isUserAuth, orderController.postPlaceOrder);
router.post('/orders/razorpay-create', isUserAuth, orderController.createRazorpayOrder);
router.post('/orders/razorpay-verify', isUserAuth, orderController.verifyRazorpayPayment);
router.get('/checkout/failure', isUserAuth, cartController.getCheckoutFailure);
router.get('/orders/success/:orderId', isUserAuth, orderController.getOrderSuccess);
router.get('/orders/:orderId', isUserAuth, orderController.getOrderDetails);
router.get('/orders/:orderId/invoice', isUserAuth, orderController.downloadInvoice);
router.get('/orders/:orderId/cancellation', isUserAuth, orderController.getCancelOrder);
router.delete('/orders/:orderId', isUserAuth, orderController.postCancelOrder);
router.get('/orders/:orderId/items/:productId/cancellation', isUserAuth, orderController.getCancelItem);
router.delete('/orders/:orderId/items/:productId', isUserAuth, orderController.postCancelItem);
router.get('/orders/:orderId/items/:productId/returns', isUserAuth, orderController.getReturnOrder);
router.post('/orders/:orderId/items/:productId/returns', isUserAuth, orderController.postReturnOrder);
router.get('/orders/:orderId/returns', isUserAuth, orderController.getEntireOrderReturn);
router.post('/orders/:orderId/returns', isUserAuth, orderController.postEntireOrderReturn);
router.get('/orders', isUserAuth, orderController.getOrderHistory);

router.get('/profile/edit', isUserAuth, userController.getProfileEdit);
router.patch('/profile', isUserAuth, upload.single('profile_image'), userController.updateProfile);

router.get('/verify-email-update', isUserAuth, userController.getVerifyEmailUpdate);
router.post('/verify-email-update', isUserAuth, userController.verifyEmailUpdate);

router.get('/profile/password', isUserAuth, userController.getProfilePassword);
router.patch('/profile/password', isUserAuth, userController.updatePassword);

router.get('/profile/addresses', isUserAuth, userController.getAddresses);
router.post('/profile/addresses', isUserAuth, userController.addAddress);
router.patch('/profile/addresses/:addressId', isUserAuth, userController.editAddress);
router.delete('/profile/addresses/:addressId', isUserAuth, userController.deleteAddress);

router.get('/support', supportController.getSupportPage);
router.post('/support', supportController.submitSupportRequest);

router.get('/notifications', isUserAuth, notificationController.getNotifications);
router.patch('/notifications/read-all', isUserAuth, notificationController.markAllAsRead);
router.patch('/notifications/:id/read', isUserAuth, notificationController.markAsRead);
router.delete('/notifications/read', isUserAuth, notificationController.deleteReadNotifications);
router.delete('/notifications/:id', isUserAuth, notificationController.deleteNotification);

router.post('/logout', authController.logout);

export default router;