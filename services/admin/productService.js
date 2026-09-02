import mongoose from 'mongoose';
import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import Platform from '../../models/Platform.js';
import { getActiveOffers, calculateBestOfferForProduct } from '../shared/offerHelper.js';
import { uploadToCloudinary } from '../../config/cloudinary.js';
import * as categoryService from './categoryService.js';

export const getAllAdminProducts = async (search = '', filters = {}, sort = 'latest', page = 1, limit = 10) => {
    try {
        const query = {};

        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }

        if (filters.type && filters.type !== 'All') {
            query.edition_type = filters.type;
        }

        if (filters.platform && filters.platform !== 'All') {
            query.platforms = filters.platform;
        }

        if (filters.developer && filters.developer !== 'All') {
            query.publisher = filters.developer;
        }

        if (filters.status && filters.status !== 'All') {
            query.status = filters.status;
        }

        // Sort configuration
        let sortConfig = { createdAt: -1 };
        if (sort === 'latest') {
            sortConfig = { createdAt: -1 };
        } else if (sort === 'oldest') {
            sortConfig = { createdAt: 1 };
        } else if (sort === 'A-Z') {
            sortConfig = { title: 1 };
        } else if (sort === 'Z-A') {
            sortConfig = { title: -1 };
        } else if (sort === 'Price-Low') {
            sortConfig = { price: 1 };
        } else if (sort === 'Price-High') {
            sortConfig = { price: -1 };
        }

        // Fetch products, categories, active offers and distinct metadata
        const [rawProducts, categories, productPlatforms, dbPublishers, activeOffers, savedPlatforms] = await Promise.all([
            Product.find(query).sort(sortConfig).lean(),
            Category.find({}).lean(),
            Product.distinct('platforms'),
            Product.distinct('publisher'),
            getActiveOffers(),
            Platform.find({ is_listed: { $ne: false } }).lean()
        ]);

        const allPlatformsSet = new Set(productPlatforms || []);
        if (savedPlatforms && savedPlatforms.length > 0) {
            savedPlatforms.forEach(p => allPlatformsSet.add(p.name));
        }
        const dbPlatforms = Array.from(allPlatformsSet).sort();

        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        // Map categories and cover images
        const productsMapped = rawProducts.map(game => {
            const catObj = game.category ? categoryMap.get(game.category.toString()) : null;
            const offerResult = calculateBestOfferForProduct(game, activeOffers, game.price);
            return {
                ...game,
                coverImageUrl: game.cover_image || game.coverImage || null,
                categoryName: catObj ? catObj.name : 'N/A',
                discountedPrice: offerResult.discountedPrice,
                offerDiscount: offerResult.discountPercentage,
                categoryDiscount: offerResult.discountPercentage,
                appliedOffer: offerResult.appliedOffer
            };
        });

        // Filter by category in memory
        let filteredProducts = productsMapped;
        if (filters.category && filters.category !== 'All') {
            filteredProducts = productsMapped.filter(game => game.categoryName === filters.category);
        }

        // Paginate in memory
        const totalCount = filteredProducts.length;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedProducts = filteredProducts.slice(startIndex, startIndex + limitNum);

        const totalPages = Math.ceil(totalCount / limitNum);

        return {
            products: paginatedProducts,
            currentPage: pageNum,
            totalPages,
            totalCount,
            limit: limitNum,
            dbPlatforms,
            dbPublishers
        };
    } catch (error) {
        console.error('[getAllAdminProducts] Error:', error);
        throw error;
    }
};

const validateProductData = (productData) => {
    if (productData.title && productData.title.length > 100) {
        throw new Error('Game title cannot exceed 100 characters.');
    }
    if (productData.publisher && productData.publisher.length > 100) {
        throw new Error('Publisher name cannot exceed 100 characters.');
    }
    if (productData.description && productData.description.length > 2000) {
        throw new Error('Description cannot exceed 2000 characters.');
    }

    // Validate Stock Limit (max 300)
    if (typeof productData.stock === 'number' && productData.stock > 300) {
        throw new Error('Maximum product stock cannot exceed 300.');
    }
    if (productData.platform_stock) {
        for (const ps of productData.platform_stock) {
            if (typeof ps.stock === 'number' && ps.stock > 300) {
                throw new Error(`Maximum variant stock for platform ${ps.platform} cannot exceed 300.`);
            }
        }
    }

    // Validate System Requirements
    if (productData.system_requirements) {
        const reqs = productData.system_requirements;
        const checkReqGroup = (groupName) => {
            const group = reqs[groupName];
            if (group) {
                const fields = ['architecture', 'os', 'processor', 'memory', 'graphics', 'storage', 'sound_card'];
                for (const f of fields) {
                    if (group[f] && group[f].length > 200) {
                        throw new Error(`System requirements ${groupName} ${f} cannot exceed 200 characters.`);
                    }
                }
                if (group.additional_notes && group.additional_notes.length > 500) {
                    throw new Error(`System requirements ${groupName} additional notes cannot exceed 500 characters.`);
                }
            }
        };
        checkReqGroup('minimum');
        checkReqGroup('recommended');
    }
};

export const createProduct = async (productData) => {
    try {
        validateProductData(productData);
        const product = new Product(productData);
        return await product.save();
    } catch (error) {
        console.error('[productService.createProduct] Error:', error);
        throw error;
    }
};

export const getProductById = async (id) => {
    try {
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return null;
        }
        return await Product.findById(id).lean();
    } catch (error) {
        console.error('[productService.getProductById] Error:', error);
        throw error;
    }
};

export const updateProduct = async (id, productData) => {
    try {
        validateProductData(productData);
        const oldProduct = await Product.findById(id).lean();
        const updatedProduct = await Product.findByIdAndUpdate(id, productData, { new: true, runValidators: true });

        if (oldProduct && updatedProduct) {
            const oldStock = oldProduct.stock || 0;
            const newStock = updatedProduct.stock || 0;
            if (oldStock === 0 && newStock > 0) {
                const { checkAndNotifyRestock } = await import('../shared/notificationHelper.js');
                checkAndNotifyRestock(updatedProduct._id, updatedProduct.title).catch(err => console.error('[updateProduct Restock Notification Error]', err));
            }
            if (oldStock >= 5 && newStock < 5 && newStock > 0) {
                const { checkAndNotifyLowStock } = await import('../shared/notificationHelper.js');
                checkAndNotifyLowStock(updatedProduct._id, oldStock, newStock, updatedProduct.title).catch(err => console.error('[updateProduct LowStock Notification Error]', err));
            }
        }

        return updatedProduct;
    } catch (error) {
        console.error('[productService.updateProduct] Error:', error);
        throw error;
    }
};

const fallbackValue = (val, defaultValue) => {
    if (val === undefined || val === null || String(val).trim() === '') {
        return defaultValue;
    }
    return String(val).trim();
};

const parsePlatformStockAndRequirements = (body) => {
    const platformsRaw = body['platforms[]'] || body.platforms || [];
    const platforms = Array.isArray(platformsRaw) ? platformsRaw : [platformsRaw];

    const platform_stock = [];
    let calculatedTotalStock = 0;
    for (const platform of platforms) {
        const stockKey = `platform_stock_${platform}`;
        const priceKey = `platform_price_${platform}`;
        const pStock = Number(body[stockKey]);
        const pPrice = Number(body[priceKey]);
        if (isNaN(pStock) || pStock < 0) {
            const err = new Error(`Stock for platform ${platform} must be a non-negative number.`);
            err.statusCode = 400;
            throw err;
        }
        if (isNaN(pPrice) || pPrice < 10000) {
            const err = new Error(`Price for platform ${platform} must be at least ₹100.00.`);
            err.statusCode = 400;
            throw err;
        }
        platform_stock.push({ platform, stock: pStock, price: pPrice });
        calculatedTotalStock += pStock;
    }

    const system_requirements = {
        minimum: {
            architecture: fallbackValue(body['system_requirements.minimum.architecture'], '64-bit'),
            os: fallbackValue(body['system_requirements.minimum.os'], 'N/A'),
            processor: fallbackValue(body['system_requirements.minimum.processor'], 'N/A'),
            memory: fallbackValue(body['system_requirements.minimum.memory'], 'N/A'),
            graphics: fallbackValue(body['system_requirements.minimum.graphics'], 'N/A'),
            storage: fallbackValue(body['system_requirements.minimum.storage'], 'N/A'),
            sound_card: body['system_requirements.minimum.sound_card'] || null,
            additional_notes: body['system_requirements.minimum.additional_notes'] || null
        },
        recommended: {
            architecture: fallbackValue(body['system_requirements.recommended.architecture'], '64-bit'),
            os: fallbackValue(body['system_requirements.recommended.os'], 'N/A'),
            processor: fallbackValue(body['system_requirements.recommended.processor'], 'N/A'),
            memory: fallbackValue(body['system_requirements.recommended.memory'], 'N/A'),
            graphics: fallbackValue(body['system_requirements.recommended.graphics'], 'N/A'),
            storage: fallbackValue(body['system_requirements.recommended.storage'], 'N/A'),
            sound_card: body['system_requirements.recommended.sound_card'] || null,
            additional_notes: body['system_requirements.recommended.additional_notes'] || null
        }
    };

    return { platforms, platform_stock, calculatedTotalStock, system_requirements };
};

export const processAndCreateProduct = async (body, files) => {
    const { title, publisher, release_year, gst_rate, price, category, edition_type, description } = body;
    const { platforms, platform_stock, calculatedTotalStock, system_requirements } = parsePlatformStockAndRequirements(body);

    const coverFiles = files && files.cover_image ? files.cover_image : [];
    const galleryFiles = files && files.gallery ? files.gallery : [];

    const categoryDetails = await categoryService.getCategoryDetailsAdmin(category);
    if (!categoryDetails || !categoryDetails.category) {
        const err = new Error('Selected category does not exist.');
        err.statusCode = 400;
        throw err;
    }
    const selectedCategory = categoryDetails.category;
    if (selectedCategory.status === 'Hidden') {
        const err = new Error('Cannot list a game under an unlisted category. Please change the game category to list the game.');
        err.statusCode = 400;
        throw err;
    }

    if (coverFiles.length === 0) {
        const err = new Error('Cover image is required.');
        err.statusCode = 400;
        throw err;
    }
    if (galleryFiles.length < 3) {
        const err = new Error('Game gallery must have at least 3 images/videos.');
        err.statusCode = 400;
        throw err;
    }
    if (galleryFiles.length > 5) {
        const err = new Error('Game gallery image limit must be capped to 5.');
        err.statusCode = 400;
        throw err;
    }

    const coverUploadResult = await uploadToCloudinary(coverFiles[0], 'pixelplay_uploads');
    const cover_image = coverUploadResult.secure_url;

    const galleryUploadPromises = galleryFiles.map(file => uploadToCloudinary(file, 'pixelplay_uploads'));
    const galleryUploadResults = await Promise.all(galleryUploadPromises);
    const gallery = galleryUploadResults.map(res => res.secure_url);

    return await createProduct({
        title,
        publisher,
        release_year: Number(release_year),
        gst_rate: Number(gst_rate),
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
};

export const processAndUpdateProduct = async (id, body, files) => {
    const { title, publisher, release_year, gst_rate, price, category, edition_type, description, status } = body;
    const { platforms, platform_stock, calculatedTotalStock, system_requirements } = parsePlatformStockAndRequirements(body);

    const existingProduct = await getProductById(id);
    if (!existingProduct) {
        const err = new Error('Game not found.');
        err.statusCode = 404;
        throw err;
    }

    const categoryDetails = await categoryService.getCategoryDetailsAdmin(category);
    if (!categoryDetails || !categoryDetails.category) {
        const err = new Error('Selected category does not exist.');
        err.statusCode = 400;
        throw err;
    }
    const selectedCategory = categoryDetails.category;
    if (status === 'Live' && selectedCategory.status === 'Hidden') {
        const err = new Error('Cannot list a game under an unlisted category. Please change the game category to list the game.');
        err.statusCode = 400;
        throw err;
    }

    const existingGalleryRaw = body.existing_gallery || body['existing_gallery[]'] || [];
    const existingGallery = Array.isArray(existingGalleryRaw) ? existingGalleryRaw : [existingGalleryRaw];
    const galleryFiles = files && files.gallery ? files.gallery : [];

    const totalGalleryCount = existingGallery.filter(url => url && url.trim() !== '').length + galleryFiles.length;
    if (totalGalleryCount < 3) {
        const err = new Error('Game gallery must have at least 3 images/videos.');
        err.statusCode = 400;
        throw err;
    }
    if (totalGalleryCount > 5) {
        const err = new Error('Game gallery image limit must be capped to 5.');
        err.statusCode = 400;
        throw err;
    }

    let cover_image = existingProduct.cover_image;
    const coverFiles = files && files.cover_image ? files.cover_image : [];
    if (coverFiles.length > 0) {
        const coverUploadResult = await uploadToCloudinary(coverFiles[0], 'pixelplay_uploads');
        cover_image = coverUploadResult.secure_url;
    }

    const newGalleryUploadPromises = galleryFiles.map(file => uploadToCloudinary(file, 'pixelplay_uploads'));
    const newGalleryUploadResults = await Promise.all(newGalleryUploadPromises);
    const newGalleryUrls = newGalleryUploadResults.map(res => res.secure_url);

    const gallery = [...existingGallery.filter(url => url && url.trim() !== ''), ...newGalleryUrls];

    return await updateProduct(id, {
        title,
        publisher,
        release_year: Number(release_year),
        gst_rate: Number(gst_rate),
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
};

