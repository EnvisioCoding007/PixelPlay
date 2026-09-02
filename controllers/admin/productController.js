import * as productService from '../../services/admin/productService.js';
import * as categoryService from '../../services/admin/categoryService.js';
import * as publisherService from '../../services/admin/publisherService.js';
import * as platformService from '../../services/admin/platformService.js';

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
            return res.status(404).render('404', {
                title: '404 - Product Not Found | PixelPlay',
                isAdminContext: true,
                url: req.originalUrl
            });
        }
        const categories = await categoryService.getAllCategories();
        const publishers = await publisherService.getAllPublishersSorted();
        const platforms = await platformService.getAllPlatformsSorted();
        res.render('admin/edit-game', {
            product,
            categories,
            publishers,
            platforms,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditGamePage]', err);
        return res.status(404).render('404', {
            title: '404 - Page Not Found | PixelPlay',
            isAdminContext: true,
            url: req.originalUrl
        });
    }
};

export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedProduct = await productService.processAndUpdateProduct(id, req.body, req.files);

        return res.status(200).json({
            success: true,
            message: 'Game updated successfully!',
            product: updatedProduct
        });
    } catch (err) {
        console.error('[editProduct]', err);
        const statusCode = err.statusCode || err.status || 500;
        return res.status(statusCode).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};

export const renderAddGamePage = async (req, res) => {
    try {
        const categories = await categoryService.getAllCategories();
        const publishers = await publisherService.getAllPublishersSorted();
        const platforms = await platformService.getAllPlatformsSorted();
        res.render('admin/add-game', {
            categories,
            publishers,
            platforms,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAddGamePage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const addProduct = async (req, res) => {
    try {
        const newProduct = await productService.processAndCreateProduct(req.body, req.files);

        return res.status(201).json({
            success: true,
            message: 'Game published successfully!',
            product: newProduct
        });
    } catch (err) {
        console.error('[addProduct]', err);
        const statusCode = err.statusCode || err.status || 500;
        return res.status(statusCode).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};
