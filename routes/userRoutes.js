import { isUserAuth, isUserUnAuth } from '../middleware/auth.js';
import express from 'express';
import passport from 'passport';

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

router.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/auth/login' }),
    (req, res) => {
        req.session.user = req.user._id;
        res.redirect('/home');
    }
);

router.get('/', (req, res) => {
    res.redirect('/home');
});

router.get('/home', isUserAuth, userController.getHome);

router.get('/auth/profile', isUserAuth, userController.getProfile);

router.get('/auth/profile/edit', isUserAuth, userController.getProfileEdit);

router.post('/auth/profile/edit', isUserAuth, userController.updateProfile);

router.get('/auth/verify-email-update', isUserAuth, userController.getVerifyEmailUpdate);

router.post('/auth/verify-email-update', isUserAuth, userController.verifyEmailUpdate);

router.get('/auth/profile/password', isUserAuth, userController.getProfilePassword);

router.post('/auth/profile/password', isUserAuth, userController.updatePassword);

router.get('/auth/profile/addresses', isUserAuth, userController.getAddresses);

router.post('/auth/profile/addresses/add', isUserAuth, userController.addAddress);

router.post('/auth/profile/addresses/edit/:addressId', isUserAuth, userController.editAddress);

router.post('/auth/profile/addresses/delete/:addressId', isUserAuth, userController.deleteAddress);

router.post('/auth/logout', userController.logout);

export default router;