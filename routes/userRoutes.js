import { isUserAuth, isUserUnAuth, handleGoogleAuth } from '../middleware/auth.js';
import express from 'express';
import passport from 'passport';
import { upload } from '../config/cloudinary.js';

import * as userController from '../controllers/userController.js';

const router = express.Router();

router.get('/auth/signup', isUserUnAuth, userController.getSignupPage);

router.post('/auth/signup', userController.signup);

router.post('/auth/send-otp', userController.sendVerificationOtp);

router.get('/auth/verify-email', isUserUnAuth, userController.getVerifyEmailPage);

router.post('/auth/verify-email', userController.verifyOtp);

router.get('/auth/login', isUserUnAuth, userController.getLogin);

router.post('/auth/login', userController.login);

router.get('/auth/reset-password-otp', isUserUnAuth, userController.resetPasswordOtpPage);

router.post('/auth/reset-password-otp', isUserUnAuth, userController.verifyForgotPasswordOtp);

router.get('/auth/forgot-password', isUserUnAuth, userController.getForgetPasswordPage);

router.post('/auth/forgot-password', isUserUnAuth, userController.forgotPasswordOtp);

router.get('/auth/reset-password', userController.getResetPasswordPage);

router.post('/auth/reset-password', userController.resetPassword);

router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));

router.get('/auth/google/callback', handleGoogleAuth);

router.get('/', userController.getHome);
router.patch('/profile/primary-platform', userController.setPrimaryPlatform);

router.get('/home', userController.getHome);

router.get('/browse', userController.getBrowsePage);
router.get('/products/:id', userController.getProductDetails);
router.get('/products/status/:id', userController.checkProductStatus);

router.get('/user/profile', isUserAuth, userController.getProfile);
router.get('/user/wishlist', isUserAuth, userController.getWishlist);
router.post('/user/wishlist', isUserAuth, userController.toggleWishlist);

router.get('/user/cart', isUserAuth, userController.getCart);
router.post('/user/cart', isUserAuth, userController.addToCart);
router.patch('/user/cart', isUserAuth, userController.updateCartQuantity);
router.delete('/user/cart', isUserAuth, userController.removeFromCart);
router.get('/user/checkout', isUserAuth, userController.getCheckout);
router.post('/user/orders', isUserAuth, userController.postPlaceOrder);
router.get('/user/orders/success/:orderId', isUserAuth, userController.getOrderSuccess);
router.get('/user/orders/:orderId', isUserAuth, userController.getOrderDetails);
router.get('/user/orders/:orderId/invoice', isUserAuth, userController.downloadInvoice);
router.get('/user/orders/:orderId/cancellation', isUserAuth, userController.getCancelOrder);
router.delete('/user/orders/:orderId', isUserAuth, userController.postCancelOrder);
router.get('/user/orders/:orderId/items/:productId/cancellation', isUserAuth, userController.getCancelItem);
router.delete('/user/orders/:orderId/items/:productId', isUserAuth, userController.postCancelItem);
router.get('/user/orders/:orderId/items/:productId/returns', isUserAuth, userController.getReturnOrder);
router.post('/user/orders/:orderId/items/:productId/returns', isUserAuth, userController.postReturnOrder);
router.get('/user/orders', isUserAuth, userController.getOrderHistory);

router.get('/user/profile/edit', isUserAuth, userController.getProfileEdit);
router.patch('/user/profile', isUserAuth, userController.updateProfile);

router.get('/user/verify-email-update', isUserAuth, userController.getVerifyEmailUpdate);
router.post('/user/verify-email-update', isUserAuth, userController.verifyEmailUpdate);

router.get('/user/profile/password', isUserAuth, userController.getProfilePassword);
router.patch('/user/profile/password', isUserAuth, userController.updatePassword);

router.get('/user/profile/addresses', isUserAuth, userController.getAddresses);
router.post('/user/profile/addresses', isUserAuth, userController.addAddress);
router.patch('/user/profile/addresses/:addressId', isUserAuth, userController.editAddress);
router.delete('/user/profile/addresses/:addressId', isUserAuth, userController.deleteAddress);

router.patch('/user/profile/avatar', upload.single('avatar'), userController.updateAvatar);

router.post('/auth/logout', userController.logout);

export default router;