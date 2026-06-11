import express from 'express';
import { isAdminAuth, isAdminUnAuth } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();


router.get('/admin/login', isAdminUnAuth, adminController.getAdminLogin);
router.post('/admin/login', isAdminUnAuth, adminController.adminLogin);


router.get('/admin/users', isAdminAuth, adminController.getCustomers);

router.post('/admin/users/toggle-block/:id', isAdminAuth, adminController.toggleBlock);

router.post('/admin/logout', isAdminAuth, adminController.adminLogout);

export default router;
