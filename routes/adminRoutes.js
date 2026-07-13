import express from 'express';
import { isAdminAuth, isAdminUnAuth } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';
import { handleProductUploads } from '../middleware/uploadMiddleware.js';

import * as authController from '../controllers/admin/authController.js';
import * as userController from '../controllers/admin/userController.js';
import * as productController from '../controllers/admin/productController.js';
import * as categoryController from '../controllers/admin/categoryController.js';
import * as publisherController from '../controllers/admin/publisherController.js';
import * as orderController from '../controllers/admin/orderController.js';

const router = express.Router();

router.get('/admin/login', isAdminUnAuth, authController.getAdminLogin);
router.post('/admin/login', isAdminUnAuth, authController.adminLogin);

router.get('/admin/users', isAdminAuth, userController.getCustomers);
router.get('/admin/customers', isAdminAuth, userController.getCustomers);
router.patch('/admin/users/:id/block-status', isAdminAuth, userController.toggleBlock);

router.get('/admin/products', isAdminAuth, productController.renderProductManagement);
router.get('/admin/products/:id/edit', isAdminAuth, productController.renderEditGamePage);
router.put('/admin/products/:id', isAdminAuth, handleProductUploads, productController.editProduct);
router.get('/admin/products/new', isAdminAuth, productController.renderAddGamePage);
router.post('/admin/products', isAdminAuth, handleProductUploads, productController.addProduct);

router.get('/admin/categories', isAdminAuth, categoryController.renderCategoryManagement);
router.get('/admin/categories/add', isAdminAuth, categoryController.renderAddCategory);
router.post('/admin/categories', isAdminAuth, upload.single('icon'), categoryController.createCategory);
router.patch('/admin/categories/:id/status', isAdminAuth, categoryController.toggleCategoryStatus);
router.get('/admin/categories/:id/edit', isAdminAuth, categoryController.renderEditCategory);
router.put('/admin/categories/:id', isAdminAuth, upload.single('icon'), categoryController.editCategory);
router.delete('/admin/categories/:id', isAdminAuth, categoryController.deleteCategory);

router.get('/admin/publishers', isAdminAuth, publisherController.renderPublisherManagement);
router.get('/admin/publishers/add', isAdminAuth, publisherController.renderAddPublisherPage);
router.post('/admin/publishers', isAdminAuth, upload.single('logo'), publisherController.createPublisher);
router.get('/admin/publishers/:id/edit', isAdminAuth, publisherController.renderEditPublisherPage);
router.put('/admin/publishers/:id', isAdminAuth, upload.single('logo'), publisherController.editPublisher);

router.get('/admin/orders', isAdminAuth, orderController.renderOrderManagement);
router.get('/admin/orders/:id', isAdminAuth, orderController.renderAdminOrderDetails);
router.patch('/admin/orders/:id/status', isAdminAuth, orderController.updateAdminOrderStatus);
router.patch('/admin/orders/:orderId/items/:productId/returns', isAdminAuth, orderController.handleItemReturn);

router.post('/admin/logout', isAdminAuth, authController.adminLogout);

export default router;
