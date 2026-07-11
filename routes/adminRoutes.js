import express from 'express';
import { isAdminAuth, isAdminUnAuth } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';
import { upload } from '../config/cloudinary.js';
import { handleProductUploads } from '../middleware/uploadMiddleware.js';

const router = express.Router();


router.get('/admin/login', isAdminUnAuth, adminController.getAdminLogin);
router.post('/admin/login', isAdminUnAuth, adminController.adminLogin);


router.get('/admin/users', isAdminAuth, adminController.getCustomers);
router.get('/admin/customers', isAdminAuth, adminController.getCustomers);

router.get('/admin/products', isAdminAuth, adminController.renderProductManagement);
router.get('/admin/products/:id/edit', isAdminAuth, adminController.renderEditGamePage);
router.put('/admin/products/:id', isAdminAuth, handleProductUploads, adminController.editProduct);
router.get('/admin/products/new', isAdminAuth, adminController.renderAddGamePage);
router.post('/admin/products', isAdminAuth, handleProductUploads, adminController.addProduct);

router.patch('/admin/users/:id/block-status', isAdminAuth, adminController.toggleBlock);

router.get('/admin/categories', isAdminAuth, adminController.renderCategoryManagement);
router.get('/admin/publishers', isAdminAuth, adminController.renderPublisherManagement);
router.get('/admin/publishers/new', isAdminAuth, adminController.renderAddPublisherPage);
router.post('/admin/publishers', isAdminAuth, upload.single('logo'), adminController.createPublisher);
router.get('/admin/publishers/:id/edit', isAdminAuth, adminController.renderEditPublisherPage);
router.put('/admin/publishers/:id', isAdminAuth, upload.single('logo'), adminController.editPublisher);
router.post('/admin/categories', isAdminAuth, upload.single('icon'), adminController.createCategory);
router.patch('/admin/categories/:id/status', isAdminAuth, adminController.toggleCategoryStatus);
router.get('/admin/categories/:id/edit', isAdminAuth, adminController.renderEditCategory);
router.put('/admin/categories/:id', isAdminAuth, upload.single('icon'), adminController.editCategory);
router.delete('/admin/categories/:id', isAdminAuth, adminController.deleteCategory);

router.get('/admin/orders', isAdminAuth, adminController.renderOrderManagement);
router.get('/admin/orders/:id', isAdminAuth, adminController.renderAdminOrderDetails);
router.patch('/admin/orders/:id/status', isAdminAuth, adminController.updateAdminOrderStatus);
router.patch('/admin/orders/:orderId/items/:productId/return', isAdminAuth, adminController.handleItemReturn);

router.post('/admin/logout', isAdminAuth, adminController.adminLogout);

export default router;

