import { isUserAuth, isUserUnAuth } from '../middleware/auth.js';
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

// Custom passport callback is used so that a blocked-user failure can surface
// an error message on the login page instead of silently redirecting.
router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) =>
        userController.handleGoogleCallback(req, res, next, err, user, info)
    )(req, res, next);
});

router.get('/', userController.getHome);
router.post('/set-primary-platform', userController.setPrimaryPlatform);

router.get('/home', userController.getHome);

router.get('/browse', userController.getBrowsePage);
router.get('/products/:id', userController.getProductDetails);
router.get('/products/status/:id', userController.checkProductStatus);

router.get('/auth/profile', isUserAuth, userController.getProfile);
router.get('/auth/wishlist', isUserAuth, userController.getWishlist);
router.post('/auth/wishlist/toggle', isUserAuth, userController.toggleWishlist);

router.get('/auth/cart', isUserAuth, userController.getCart);
router.post('/auth/cart/add', isUserAuth, userController.addToCart);
router.post('/auth/cart/update-quantity', isUserAuth, userController.updateCartQuantity);
router.post('/auth/cart/remove', isUserAuth, userController.removeFromCart);

router.get('/auth/profile/edit', isUserAuth, userController.getProfileEdit);

router.post('/auth/profile/edit', isUserAuth, userController.updateProfile);

router.get('/auth/verify-email-update', isUserAuth, userController.getVerifyEmailUpdate);

router.post('/auth/verify-email-update', isUserAuth, userController.verifyEmailUpdate);

router.get('/auth/profile/password', isUserAuth, userController.getProfilePassword);

router.post('/auth/profile/password', isUserAuth, userController.updatePassword);

router.get('/auth/profile/addresses', isUserAuth, userController.getAddresses);

router.put('/auth/profile/addresses/add', isUserAuth, userController.addAddress);

router.patch('/auth/profile/addresses/edit/:addressId', isUserAuth, userController.editAddress);

router.delete('/auth/profile/addresses/delete/:addressId', isUserAuth, userController.deleteAddress);

router.post('/profile/update-avatar',upload.single('avatar'),userController.updateAvatar);

router.post('/auth/logout', userController.logout);

export default router;