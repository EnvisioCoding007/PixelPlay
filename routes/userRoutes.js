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

const router = express.Router();

router.get('/auth/signup', isUserUnAuth, authController.getSignupPage);
router.post('/auth/signup', authController.signup);
router.post('/auth/send-otp', authController.sendVerificationOtp);
router.get('/auth/verify-email', isUserUnAuth, authController.getVerifyEmailPage);
router.post('/auth/verify-email', authController.verifyOtp);

router.get('/auth/login', isUserUnAuth, authController.getLogin);
router.post('/auth/login', authController.login);

router.get('/auth/reset-password-otp', isUserUnAuth, authController.resetPasswordOtpPage);
router.post('/auth/reset-password-otp', isUserUnAuth, authController.verifyForgotPasswordOtp);

router.get('/auth/forgot-password', isUserUnAuth, authController.getForgetPasswordPage);
router.post('/auth/forgot-password', isUserUnAuth, authController.forgotPasswordOtp);

router.get('/auth/reset-password', authController.getResetPasswordPage);
router.post('/auth/reset-password', authController.resetPassword);

router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));
router.get('/auth/google/callback', handleGoogleAuth);

router.get('/', productController.getHome);
router.patch('/profile/primary-platform', productController.setPrimaryPlatform);
router.get('/home', productController.getHome);

router.get('/browse', productController.getBrowsePage);
router.get('/products/:id', productController.getProductDetails);
router.get('/products/status/:id', productController.checkProductStatus);

router.get('/user/profile', isUserAuth, userController.getProfile);
router.get('/user/wishlist', isUserAuth, wishlistController.getWishlist);
router.post('/user/wishlist', isUserAuth, wishlistController.toggleWishlist);

router.get('/user/cart', isUserAuth, cartController.getCart);
router.post('/user/cart', isUserAuth, cartController.addToCart);
router.patch('/user/cart', isUserAuth, cartController.updateCartQuantity);
router.delete('/user/cart', isUserAuth, cartController.removeFromCart);
router.get('/user/checkout', isUserAuth, cartController.getCheckout);

router.post('/user/orders', isUserAuth, orderController.postPlaceOrder);
router.get('/user/orders/success/:orderId', isUserAuth, orderController.getOrderSuccess);
router.get('/user/orders/:orderId', isUserAuth, orderController.getOrderDetails);
router.get('/user/orders/:orderId/invoice', isUserAuth, orderController.downloadInvoice);
router.get('/user/orders/:orderId/cancellation', isUserAuth, orderController.getCancelOrder);
router.delete('/user/orders/:orderId', isUserAuth, orderController.postCancelOrder);
router.get('/user/orders/:orderId/items/:productId/cancellation', isUserAuth, orderController.getCancelItem);
router.delete('/user/orders/:orderId/items/:productId', isUserAuth, orderController.postCancelItem);
router.get('/user/orders/:orderId/items/:productId/returns', isUserAuth, orderController.getReturnOrder);
router.post('/user/orders/:orderId/items/:productId/returns', isUserAuth, orderController.postReturnOrder);
router.get('/user/orders', isUserAuth, orderController.getOrderHistory);

router.get('/user/profile/edit', isUserAuth, userController.getProfileEdit);
router.patch('/user/profile', isUserAuth, upload.single('profile_image'), userController.updateProfile);

router.get('/user/verify-email-update', isUserAuth, userController.getVerifyEmailUpdate);
router.post('/user/verify-email-update', isUserAuth, userController.verifyEmailUpdate);

router.get('/user/profile/password', isUserAuth, userController.getProfilePassword);
router.patch('/user/profile/password', isUserAuth, userController.updatePassword);

router.get('/user/profile/addresses', isUserAuth, userController.getAddresses);
router.post('/user/profile/addresses', isUserAuth, userController.addAddress);
router.patch('/user/profile/addresses/:addressId', isUserAuth, userController.editAddress);
router.delete('/user/profile/addresses/:addressId', isUserAuth, userController.deleteAddress);

router.patch('/user/profile/avatar', upload.single('avatar'), userController.updateAvatar);

router.post('/auth/logout', authController.logout);

export default router;