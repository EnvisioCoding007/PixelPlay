import * as productService from '../../services/productService.js';
import * as categoryService from '../../services/categoryService.js';
import * as publisherService from '../../services/publisherService.js';
import { uploadToCloudinary } from '../../config/cloudinary.js';

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
        for (const platform of platforms) {
            const stockKey = `platform_stock_${platform}`;
            const priceKey = `platform_price_${platform}`;
            const pStock = Number(req.body[stockKey]);
            const pPrice = Number(req.body[priceKey]);
            if (isNaN(pStock) || pStock < 0) {
                return res.status(400).json({ success: false, message: `Stock for platform ${platform} must be a non-negative number.` });
            }
            if (isNaN(pPrice) || pPrice < 10000) {
                return res.status(400).json({ success: false, message: `Price for platform ${platform} must be at least ₹100.00.` });
            }
            platform_stock.push({ platform, stock: pStock, price: pPrice });
            calculatedTotalStock += pStock;
        }

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
        for (const platform of platforms) {
            const stockKey = `platform_stock_${platform}`;
            const priceKey = `platform_price_${platform}`;
            const pStock = Number(req.body[stockKey]);
            const pPrice = Number(req.body[priceKey]);
            if (isNaN(pStock) || pStock < 0) {
                return res.status(400).json({ success: false, message: `Stock for platform ${platform} must be a non-negative number.` });
            }
            if (isNaN(pPrice) || pPrice < 10000) {
                return res.status(400).json({ success: false, message: `Price for platform ${platform} must be at least ₹100.00.` });
            }
            platform_stock.push({ platform, stock: pStock, price: pPrice });
            calculatedTotalStock += pStock;
        }

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
