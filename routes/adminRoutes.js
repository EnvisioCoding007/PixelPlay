import express from 'express';
import { isAdminAuth, isAdminUnAuth } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';
import { handleProductUploads } from '../middleware/uploadMiddleware.js';

import * as authController from '../controllers/admin/authController.js';
import * as dashboardController from '../controllers/admin/dashboardController.js';
import * as userController from '../controllers/admin/userController.js';
import * as productController from '../controllers/admin/productController.js';
import * as categoryController from '../controllers/admin/categoryController.js';
import * as publisherController from '../controllers/admin/publisherController.js';
import * as platformController from '../controllers/admin/platformController.js';
import * as orderController from '../controllers/admin/orderController.js';
import * as couponController from '../controllers/admin/couponController.js';
import * as offerController from '../controllers/admin/offerController.js';
import * as walletController from '../controllers/admin/walletController.js';
import * as reviewController from '../controllers/admin/reviewController.js';

const router = express.Router();

// ==========================================
// 1. GUEST ADMIN BLOCK
// ==========================================
router.get('/admin/login', isAdminUnAuth, authController.getAdminLogin);
router.post('/admin/login', isAdminUnAuth, authController.adminLogin);

// ==========================================
// 2. PROTECTED ADMIN BLOCK
// ==========================================
router.use('/admin', isAdminAuth);

// Admin Dashboard & Sales Reports Routes
router.get('/admin', (req, res) => res.redirect('/admin/dashboard'));
router.get('/admin/dashboard', dashboardController.renderDashboard);
router.get('/admin/dashboard/chart-data', dashboardController.getChartData);
router.get('/admin/dashboard/export/excel', dashboardController.exportSalesReportExcel);
router.get('/admin/dashboard/export/pdf', dashboardController.exportSalesReportPDF);

// Admin Review Management Routes
router.get('/admin/reviews', reviewController.renderReviewManagement);
router.patch('/admin/reviews/:id/flag', reviewController.toggleFlagReview);
router.delete('/admin/reviews/:id', reviewController.deleteReview);

// User Management Routes
router.get('/admin/users', userController.getCustomers);
router.get('/admin/customers', userController.getCustomers);
router.patch('/admin/users/:id/block-status', userController.toggleBlock);

// Platform Management Routes
router.get('/admin/platforms', platformController.getPlatformsJson);
router.post('/admin/platforms', platformController.createPlatform);

// Product Management Routes
router.get('/admin/products', productController.renderProductManagement);
router.get('/admin/products/:id/edit', productController.renderEditGamePage);
router.put('/admin/products/:id', handleProductUploads, productController.editProduct);
router.get('/admin/products/new', productController.renderAddGamePage);
router.post('/admin/products', handleProductUploads, productController.addProduct);

// Category Management Routes
router.get('/admin/categories', categoryController.renderCategoryManagement);
router.get('/admin/categories/add', categoryController.renderAddCategory);
router.post('/admin/categories', upload.single('icon'), categoryController.createCategory);
router.patch('/admin/categories/:id/status', categoryController.toggleCategoryStatus);
router.get('/admin/categories/:id/edit', categoryController.renderEditCategory);
router.put('/admin/categories/:id', upload.single('icon'), categoryController.editCategory);
router.delete('/admin/categories/:id', categoryController.deleteCategory);

// Publisher Management Routes
router.get('/admin/publishers', publisherController.renderPublisherManagement);
router.get('/admin/publishers/add', publisherController.renderAddPublisherPage);
router.post('/admin/publishers', upload.single('logo'), publisherController.createPublisher);
router.get('/admin/publishers/:id/edit', publisherController.renderEditPublisherPage);
router.put('/admin/publishers/:id', upload.single('logo'), publisherController.editPublisher);

// Order Management Routes
router.get('/admin/orders', orderController.renderOrderManagement);
router.get('/admin/orders/:id', orderController.renderAdminOrderDetails);
router.patch('/admin/orders/:id/status', orderController.updateAdminOrderStatus);
router.patch('/admin/orders/:orderId/items/:productId/returns', orderController.handleItemReturn);

// Admin Coupon Management Routes
router.get('/admin/coupons', couponController.getCouponsPage);
router.post('/admin/coupons', couponController.createCoupon);
router.get('/admin/coupons/:id', couponController.getCouponById);
router.put('/admin/coupons/:id', couponController.updateCoupon);
router.patch('/admin/coupons/:id/status', couponController.toggleCouponStatus);
router.delete('/admin/coupons/:id', couponController.deleteCoupon);

// Admin Offer Management Routes
router.get('/admin/offers', offerController.getOffersPage);
router.get('/admin/offers/target-options', offerController.getTargetOptions);
router.post('/admin/offers', offerController.createOffer);
router.get('/admin/offers/:id', offerController.getOfferById);
router.put('/admin/offers/:id', offerController.updateOffer);
router.patch('/admin/offers/:id/status', offerController.toggleOfferStatus);
router.delete('/admin/offers/:id', offerController.deleteOffer);

// Wallet Oversight Routes
router.get('/admin/wallet-oversight', walletController.getWalletOversightPage);
router.post('/admin/wallet-oversight/adjust', walletController.adjustUserWallet);

// Logout
router.post('/admin/logout', authController.adminLogout);

export default router;
