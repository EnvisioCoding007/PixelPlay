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
router.get('/admin/products/edit/:id', isAdminAuth, adminController.renderEditGamePage);
router.post('/admin/products/edit/:id', isAdminAuth, handleProductUploads, adminController.editProduct);
router.get('/admin/products/add', isAdminAuth, adminController.renderAddGamePage);

router.post('/admin/products/add', isAdminAuth, handleProductUploads, adminController.addProduct);


router.post('/admin/users/toggle-block/:id', isAdminAuth, adminController.toggleBlock);

router.get('/admin/categories', isAdminAuth, adminController.renderCategoryManagement);
router.get('/admin/publishers', isAdminAuth, adminController.renderPublisherManagement);
router.get('/admin/publishers/add', isAdminAuth, adminController.renderAddPublisherPage);
router.post('/admin/publishers/add', isAdminAuth, upload.single('logo'), adminController.createPublisher);
router.get('/admin/publishers/edit/:id', isAdminAuth, adminController.renderEditPublisherPage);
router.post('/admin/publishers/edit/:id', isAdminAuth, upload.single('logo'), adminController.editPublisher);
router.post('/admin/categories', isAdminAuth, upload.single('icon'), adminController.createCategory);
router.post('/admin/categories/toggle-status/:id', isAdminAuth, adminController.toggleCategoryStatus);
router.get('/admin/categories/edit/:id', isAdminAuth, adminController.renderEditCategory);
router.post('/admin/categories/edit/:id', isAdminAuth, upload.single('icon'), adminController.editCategory);
router.post('/admin/categories/delete/:id', isAdminAuth, adminController.deleteCategory);

router.get('/admin/orders', isAdminAuth, adminController.renderOrderManagement);
router.get('/admin/orders/:id', isAdminAuth, adminController.renderAdminOrderDetails);
router.post('/admin/orders/update-status/:id', isAdminAuth, adminController.updateAdminOrderStatus);

router.post('/admin/logout', isAdminAuth, adminController.adminLogout);

export default router;

