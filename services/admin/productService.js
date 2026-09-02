import mongoose from 'mongoose';
import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import Platform from '../../models/Platform.js';
import { getActiveOffers, calculateBestOfferForProduct } from '../shared/offerHelper.js';

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

