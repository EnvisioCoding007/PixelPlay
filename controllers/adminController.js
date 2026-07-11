import bcrypt from 'bcrypt';
import * as productService from '../services/productService.js';
import * as categoryService from '../services/categoryService.js';
import * as orderService from '../services/orderService.js';
import * as userService from '../services/userService.js';
import * as publisherService from '../services/publisherService.js';
import { uploadToCloudinary } from '../config/cloudinary.js';

export const getAdminLogin = (req, res) => {
    res.render('admin/login', { error: null });
};

export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin/login', { error: 'Email and password are required.' });
        }

        const user = await userService.getAdminByEmail(email);

        if (!user) {
            return res.render('admin/login', { error: 'Invalid credentials.' });
        }

        if (user.role !== 'admin') {
            return res.render('admin/login', { error: 'Access denied. Admins only.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.render('admin/login', { error: 'Invalid credentials.' });
        }

        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error('[adminLogin] session.regenerate error:', regenErr);
                return res.render('admin/login', { error: 'Session error. Please try again.' });
            }

            req.session.admin = { _id: user._id, role: 'admin' };

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('[adminLogin] session.save error:', saveErr);
                    return res.render('admin/login', { error: 'Session error. Please try again.' });
                }
                return res.redirect('/admin/users');
            });
        });
    } catch (err) {
        console.error('[adminLogin]', err);
        return res.render('admin/login', { error: 'An unexpected error occurred. Please try again.' });
    }
};

export const getCustomers = async (req, res) => {
    try {
        const { page = 1, search = '', limit = 10, status = '', tier = '', sort = '-createdAt', verification = '' } = req.query;

        const result = await userService.getCustomers(search, status, verification, sort, page, limit);

        const currentFilters = {};
        if (search) currentFilters.search = search;
        if (status) currentFilters.status = status;
        if (tier) currentFilters.tier = tier;
        if (sort && sort !== '-createdAt') currentFilters.sort = sort;
        if (verification) currentFilters.verification = verification;

        res.render('admin/customer-management', {
            users: result.users,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            search,
            status,
            tier,
            sort,
            verification,
            currentSearch: search,
            currentStatus: status,
            currentSort: sort,
            currentVerification: verification,
            currentFilters,
            limit: parseInt(limit, 10),
        });
    } catch (err) {
        console.error('[getCustomers]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const toggleBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await userService.toggleUserBlock(id);

        return res.status(200).json({
            success: true,
            is_blocked: result.is_blocked,
            message: result.message,
        });
    } catch (err) {
        console.error('[toggleBlock]', err);
        return res.status(500).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};

export const adminLogout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};

export const renderProductManagement = async (req, res) => {
    try {
        const { search = '', category = 'All', type = 'All', sort = 'latest', page = 1, platform = 'All', developer = 'All', status = 'All' } = req.query;
        const limit = 10;

        const result = await productService.getAllAdminProducts(
            search,
            { category, type, platform, developer, status },
            sort,
            parseInt(page, 10),
            limit
        );

        const activeCategories = await categoryService.getAllActiveCategories();
        const dbCategoryNames = activeCategories.map(c => c.name);

        res.render('admin/listed-games', {
            products: result.products,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            limit: result.limit,
            search,
            category,
            type,
            sort,
            platform,
            developer,
            status,
            dbCategoryNames,
            dbPlatforms: result.dbPlatforms,
            dbPublishers: result.dbPublishers,
            user: req.session.admin || req.session.user || null
        });
    } catch (err) {
        console.error('[renderProductManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderEditGamePage = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await productService.getProductById(id);
        if (!product) {
            return res.status(404).send('Product not found');
        }
        const categories = await categoryService.getAllCategories();
        const publishers = await publisherService.getAllPublishersSorted();
        res.render('admin/edit-game', {
            product,
            categories,
            publishers,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditGamePage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            publisher,
            release_year,
            price,
            stock,
            category,
            edition_type,
            description,
            status
        } = req.body;

        const platformsRaw = req.body['platforms[]'] || req.body.platforms || [];
        const platforms = Array.isArray(platformsRaw) ? platformsRaw : [platformsRaw];

        const platform_stock = [];
        let calculatedTotalStock = 0;
        platforms.forEach(platform => {
            const stockKey = `platform_stock_${platform}`;
            const priceKey = `platform_price_${platform}`;
            const pStock = Number(req.body[stockKey]) || 0;
            const pPrice = Number(req.body[priceKey]) || 0;
            platform_stock.push({ platform, stock: pStock, price: pPrice });
            calculatedTotalStock += pStock;
        });

        const fallbackValue = (val, defaultValue) => {
            if (val === undefined || val === null || String(val).trim() === '') {
                return defaultValue;
            }
            return String(val).trim();
        };

        const system_requirements = {
            minimum: {
                architecture: fallbackValue(req.body['system_requirements.minimum.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.minimum.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.minimum.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.minimum.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.minimum.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.minimum.storage'], 'N/A'),
                sound_card: req.body['system_requirements.minimum.sound_card'] || null,
                additional_notes: req.body['system_requirements.minimum.additional_notes'] || null
            },
            recommended: {
                architecture: fallbackValue(req.body['system_requirements.recommended.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.recommended.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.recommended.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.recommended.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.recommended.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.recommended.storage'], 'N/A'),
                sound_card: req.body['system_requirements.recommended.sound_card'] || null,
                additional_notes: req.body['system_requirements.recommended.additional_notes'] || null
            }
        };

        const existingProduct = await productService.getProductById(id);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: 'Game not found.' });
        }

        const categoryDetails = await categoryService.getCategoryDetailsAdmin(category);
        if (!categoryDetails || !categoryDetails.category) {
            return res.status(400).json({ success: false, message: 'Selected category does not exist.' });
        }
        const selectedCategory = categoryDetails.category;

        if (status === 'Live' && selectedCategory.status === 'Hidden') {
            return res.status(400).json({ success: false, message: 'Cannot list a game under an unlisted category. Please change the game category to list the game.' });
        }

        const existingGalleryRaw = req.body.existing_gallery || req.body['existing_gallery[]'] || [];
        const existingGallery = Array.isArray(existingGalleryRaw) ? existingGalleryRaw : [existingGalleryRaw];
        const galleryFiles = req.files && req.files.gallery ? req.files.gallery : [];

        const totalGalleryCount = existingGallery.filter(url => url && url.trim() !== '').length + galleryFiles.length;
        if (totalGalleryCount < 3) {
            return res.status(400).json({ success: false, message: 'Game gallery must have at least 3 images/videos.' });
        }
        if (totalGalleryCount > 5) {
            return res.status(400).json({ success: false, message: 'Game gallery image limit must be capped to 5.' });
        }

        let cover_image = existingProduct.cover_image;
        const coverFiles = req.files && req.files.cover_image ? req.files.cover_image : [];
        if (coverFiles.length > 0) {
            const coverUploadResult = await uploadToCloudinary(coverFiles[0], 'pixelplay_uploads');
            cover_image = coverUploadResult.secure_url;
        }
        const newGalleryUploadPromises = galleryFiles.map(file => uploadToCloudinary(file, 'pixelplay_uploads'));
        const newGalleryUploadResults = await Promise.all(newGalleryUploadPromises);
        const newGalleryUrls = newGalleryUploadResults.map(res => res.secure_url);

        const gallery = [...existingGallery.filter(url => url && url.trim() !== ''), ...newGalleryUrls];

        const updatedProduct = await productService.updateProduct(id, {
            title,
            publisher,
            release_year: Number(release_year),
            price: Number(price),
            stock: calculatedTotalStock,
            platform_stock,
            category,
            platforms,
            edition_type,
            description,
            cover_image,
            gallery,
            system_requirements,
            status: status || 'Live'
        });

        return res.status(200).json({
            success: true,
            message: 'Game updated successfully!',
            product: updatedProduct
        });
    } catch (err) {
        console.error('[editProduct]', err);
        return res.status(500).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};

export const renderAddGamePage = async (req, res) => {
    try {
        const categories = await categoryService.getAllCategories();
        const publishers = await publisherService.getAllPublishersSorted();
        res.render('admin/add-game', {
            categories,
            publishers,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAddGamePage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const addProduct = async (req, res) => {
    try {
        const {
            title,
            publisher,
            release_year,
            price,
            stock,
            category,
            edition_type,
            description
        } = req.body;

        const platformsRaw = req.body['platforms[]'] || req.body.platforms || [];
        const platforms = Array.isArray(platformsRaw) ? platformsRaw : [platformsRaw];

        const platform_stock = [];
        let calculatedTotalStock = 0;
        platforms.forEach(platform => {
            const stockKey = `platform_stock_${platform}`;
            const priceKey = `platform_price_${platform}`;
            const pStock = Number(req.body[stockKey]) || 0;
            const pPrice = Number(req.body[priceKey]) || 0;
            platform_stock.push({ platform, stock: pStock, price: pPrice });
            calculatedTotalStock += pStock;
        });

        const fallbackValue = (val, defaultValue) => {
            if (val === undefined || val === null || String(val).trim() === '') {
                return defaultValue;
            }
            return String(val).trim();
        };

        const system_requirements = {
            minimum: {
                architecture: fallbackValue(req.body['system_requirements.minimum.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.minimum.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.minimum.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.minimum.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.minimum.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.minimum.storage'], 'N/A'),
                sound_card: req.body['system_requirements.minimum.sound_card'] || null,
                additional_notes: req.body['system_requirements.minimum.additional_notes'] || null
            },
            recommended: {
                architecture: fallbackValue(req.body['system_requirements.recommended.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.recommended.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.recommended.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.recommended.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.recommended.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.recommended.storage'], 'N/A'),
                sound_card: req.body['system_requirements.recommended.sound_card'] || null,
                additional_notes: req.body['system_requirements.recommended.additional_notes'] || null
            }
        };

        const coverFiles = req.files && req.files.cover_image ? req.files.cover_image : [];
        const galleryFiles = req.files && req.files.gallery ? req.files.gallery : [];

        const categoryDetails = await categoryService.getCategoryDetailsAdmin(category);
        if (!categoryDetails || !categoryDetails.category) {
            return res.status(400).json({ success: false, message: 'Selected category does not exist.' });
        }
        const selectedCategory = categoryDetails.category;

        if (selectedCategory.status === 'Hidden') {
            return res.status(400).json({ success: false, message: 'Cannot list a game under an unlisted category. Please change the game category to list the game.' });
        }
        if (galleryFiles.length > 5) {
            return res.status(400).json({ success: false, message: 'Game gallery image limit must be capped to 5.' });
        }

        if (coverFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'Cover image is required.' });
        }
        if (galleryFiles.length < 3) {
            return res.status(400).json({ success: false, message: 'Game gallery must have at least 3 images/videos.' });
        }

        const coverUploadResult = await uploadToCloudinary(coverFiles[0], 'pixelplay_uploads');
        const cover_image = coverUploadResult.secure_url;

        const galleryUploadPromises = galleryFiles.map(file => uploadToCloudinary(file, 'pixelplay_uploads'));
        const galleryUploadResults = await Promise.all(galleryUploadPromises);
        const gallery = galleryUploadResults.map(res => res.secure_url);

        const newProduct = await productService.createProduct({
            title,
            publisher,
            release_year: Number(release_year),
            price: Number(price),
            stock: calculatedTotalStock,
            platform_stock,
            category,
            platforms,
            edition_type,
            description,
            cover_image,
            gallery,
            system_requirements
        });

        return res.status(201).json({
            success: true,
            message: 'Game published successfully!',
            product: newProduct
        });
    } catch (err) {
        console.error('[addProduct]', err);
        return res.status(500).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};

export const renderCategoryManagement = async (req, res) => {
    try {
        const { search = '', page = 1, error, success } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = 8;

        const { categories, currentPage, totalPages, totalCount } = await categoryService.getAllCategoriesAdmin(search, pageNum, limitNum);

        res.render('admin/add-category', {
            categories,
            currentPage,
            totalPages,
            totalCount,
            limit: limitNum,
            search,
            error: error || null,
            success: success || null,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderCategoryManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const createCategory = async (req, res) => {
    try {
        const { name, defaultOffer, description } = req.body;

        let iconUrl = '';
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            iconUrl = uploadResult.secure_url;
        }

        await categoryService.createCategory({ 
            name,
            defaultOffer,
            description,
            icon: iconUrl
        });
        res.redirect('/admin/categories?success=Category added successfully.');
    } catch (err) {
        console.error('[createCategory]', err);
        res.redirect(`/admin/categories?error=${encodeURIComponent(err.message || 'Internal Server Error')}`);
    }
};

export const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await categoryService.toggleCategoryStatus(id);

        return res.status(200).json({
            success: true,
            status: result.status,
            message: result.message
        });
    } catch (err) {
        console.error('[toggleCategoryStatus]', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal Server Error.' });
    }
};

export const renderEditCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await categoryService.getCategoryDetailsAdmin(id);
        if (!details) {
            return res.status(404).send('Category not found');
        }

        res.render('admin/edit-category', {
            category: details.category,
            linkedGamesCount: details.linkedGamesCount,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditCategory]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const editCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, defaultOffer, description, status } = req.body;

        let iconUrl = undefined;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            iconUrl = uploadResult.secure_url;
        }

        await categoryService.updateCategory(id, {
            name,
            defaultOffer,
            description,
            status,
            icon: iconUrl
        });
        res.redirect('/admin/categories?success=Category updated successfully.');
    } catch (err) {
        console.error('[editCategory]', err);
        res.status(500).send(err.message || 'Internal Server Error');
    }
};

export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await categoryService.deleteCategory(id);

        return res.status(200).json({ success: true, message: 'Category deleted successfully.' });
    } catch (err) {
        console.error('[deleteCategory]', err);
        return res.status(400).json({ success: false, message: err.message || 'Internal Server Error.' });
    }
};

export const renderPublisherManagement = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 8, sort = 'latest', success } = req.query;

        const result = await publisherService.getAllPublishersAdmin(search, sort, page, limit);

        res.render('admin/listed-publishers', {
            publishers: result.publishers,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            limit: parseInt(limit, 10),
            search,
            sort,
            success: success || null,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderPublisherManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderAddPublisherPage = (req, res) => {
    try {
        const { error } = req.query;
        res.render('admin/add-publisher', {
            error: error || null,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAddPublisherPage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const createPublisher = async (req, res) => {
    try {
        const { publisher_name, official_website, brief_description } = req.body;

        let logoUrl = '';
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            logoUrl = uploadResult.secure_url;
        }

        await publisherService.createPublisher({
            name: publisher_name,
            website: official_website,
            logo: logoUrl,
            description: brief_description
        });

        res.redirect('/admin/publishers?success=Publisher added successfully.');
    } catch (err) {
        console.error('[createPublisher]', err);
        res.redirect(`/admin/publishers/add?error=${encodeURIComponent(err.message || 'Internal Server Error')}`);
    }
};

export const renderEditPublisherPage = async (req, res) => {
    try {
        const publisher = await publisherService.getPublisherById(req.params.id);
        if (!publisher) {
            return res.status(404).send('Publisher not found');
        }
        res.render('admin/edit-publisher', {
            publisher,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditPublisherPage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const editPublisher = async (req, res) => {
    try {
        const { publisher_name, official_website, studio_description, is_listed } = req.body;

        let logoUrl = undefined;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            logoUrl = uploadResult.secure_url;
        }

        await publisherService.updatePublisher(req.params.id, {
            name: publisher_name,
            website: official_website,
            logo: logoUrl,
            description: studio_description,
            is_listed: is_listed
        });

        res.redirect('/admin/publishers?success=Publisher updated successfully.');
    } catch (err) {
        console.error('[editPublisher]', err);
        res.status(400).send(err.message || 'Internal Server Error');
    }
};

export const renderOrderManagement = async (req, res) => {
    try {
        const { search = '', status = 'All', paymentMethod = 'All', sort = 'newest', page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        const [stats, orderData] = await Promise.all([
            orderService.getAdminOrderStats(),
            orderService.getAllOrdersAdminPaginated(search, status, paymentMethod, sort, pageNum, limitNum)
        ]);

        const currentFilters = {};
        if (search) currentFilters.search = search;
        if (status && status !== 'All') currentFilters.status = status;
        if (paymentMethod && paymentMethod !== 'All') currentFilters.paymentMethod = paymentMethod;
        if (sort && sort !== 'newest') currentFilters.sort = sort;

        res.render('admin/order-management', {
            stats,
            orders: orderData.orders,
            currentPage: orderData.currentPage,
            totalPages: orderData.totalPages,
            totalCount: orderData.totalCount,
            search,
            status,
            paymentMethod,
            sort,
            limit: limitNum,
            currentFilters,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderOrderManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderAdminOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await orderService.getOrderDetailsAdmin(id);
        if (!details) {
            return res.status(404).send('Order not found');
        }

        res.render('admin/order-details', {
            order: details.order,
            lifetimeOrdersCount: details.lifetimeOrdersCount,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAdminOrderDetails]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const updateAdminOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { orderStatus } = req.body;

        if (!orderStatus) {
            return res.status(400).json({ success: false, message: 'Order status is required.' });
        }

        const updatedOrder = await orderService.updateOrderStatus(id, orderStatus);

        const isAjax =
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            (req.headers['accept'] && req.headers['accept'].includes('application/json'));

        if (isAjax) {
            return res.status(200).json({
                success: true,
                message: `Order status updated to ${updatedOrder.orderStatus}.`,
                orderStatus: updatedOrder.orderStatus,
                paymentStatus: updatedOrder.paymentStatus
            });
        }

        res.redirect(`/admin/orders/${id}`);
    } catch (err) {
        console.error('[updateAdminOrderStatus]', err);
        const isAjax =
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            (req.headers['accept'] && req.headers['accept'].includes('application/json'));

        if (isAjax) {
            return res.status(500).json({ success: false, message: err.message || 'Failed to update order status.' });
        }

        res.status(500).send('Internal Server Error');
    }
};

export const handleItemReturn = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { platform } = req.query;
        const { reason, decision } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Comment/reason is required.' });
        }
        if (!decision || (decision !== 'approve' && decision !== 'reject')) {
            return res.status(400).json({ success: false, message: 'Invalid decision.' });
        }

        if (decision === 'approve') {
            await orderService.approveItemReturn(orderId, productId, reason, platform);
            return res.status(200).json({
                success: true,
                message: 'Return request approved successfully.'
            });
        } else {
            await orderService.rejectItemReturn(orderId, productId, reason, platform);
            return res.status(200).json({
                success: true,
                message: 'Return request rejected successfully.'
            });
        }
    } catch (err) {
        console.error('[handleItemReturn]', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to process return request.' });
    }
};
