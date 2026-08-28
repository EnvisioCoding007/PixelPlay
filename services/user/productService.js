import mongoose from 'mongoose';
import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import Publisher from '../../models/Publisher.js';
import User from '../../models/User.js';
import Wishlist from '../../models/Wishlist.js';
import { getActiveOffers, calculateBestOfferForProduct } from '../shared/offerHelper.js';

const getProductRating = (product) => {
    if (!product || typeof product.avgRating === 'undefined') return 0;
    return parseFloat((product.avgRating || 0).toFixed(1));
};

const getProductReviewsCount = (product) => {
    if (!product || typeof product.reviewCount === 'undefined') return '(0)';
    return `(${product.reviewCount || 0})`;
};

export const getBrowseProductsAndFilters = async (search = '', filters = {}, sort = 'Trending', page = 1, limit = 12, primaryPlatform = 'PC') => {
    try {
        const categories = await Category.find({ status: 'Live' }).lean();
        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        const [rawProducts, activeOffers] = await Promise.all([
            Product.find({ status: 'Live' }).lean(),
            getActiveOffers()
        ]);

        const allPlatforms = new Set();
        const allPublishers = new Set();
        
        const savedPubs = await Publisher.find({}).lean();
        savedPubs.forEach(sp => {
            if (sp.name) allPublishers.add(sp.name);
        });

        rawProducts.forEach(p => {
            if (p.platforms) p.platforms.forEach(plat => allPlatforms.add(plat));
            if (p.publisher) allPublishers.add(p.publisher);
        });
        const dbPlatforms = Array.from(allPlatforms).sort();
        const dbPublishers = Array.from(allPublishers).sort();

        let products = rawProducts.map(game => {
            const catObj = game.category ? categoryMap.get(game.category.toString()) : null;
            
            let basePrice = game.price || 0;
            let currentPlatformStock = game.stock || 0;
            if (game.platform_stock && game.platform_stock.length > 0) {
                const platStock = game.platform_stock.find(ps => ps.platform.toLowerCase() === primaryPlatform.toLowerCase());
                if (platStock && typeof platStock.price === 'number') {
                    basePrice = platStock.price;
                    currentPlatformStock = platStock.stock;
                } else {
                    currentPlatformStock = 0;
                    const firstPlat = game.platform_stock[0];
                    if (firstPlat && typeof firstPlat.price === 'number') {
                        basePrice = firstPlat.price;
                    }
                }
            }

            const offerResult = calculateBestOfferForProduct(game, activeOffers, basePrice);
            const isEffectiveOutOfStock = (game.stock === 0 || currentPlatformStock === 0);

            return {
                ...game,
                price: basePrice,
                currentPlatformStock,
                isEffectiveOutOfStock,
                coverImageUrl: game.cover_image || game.coverImage || null,
                categoryName: catObj ? catObj.name : 'N/A',
                discountedPrice: offerResult.discountedPrice,
                offerDiscount: offerResult.discountPercentage,
                categoryDiscount: offerResult.discountPercentage,
                appliedOffer: offerResult.appliedOffer,
                rating: getProductRating(game),
                reviewsCount: getProductReviewsCount(game)
            };
        });

        // Search Filter
        if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            products = products.filter(p => p.title.toLowerCase().includes(s));
        }

        // Category Filter
        const selectedGenres = Array.isArray(filters.genre) ? filters.genre : (filters.genre ? [filters.genre] : []);
        if (selectedGenres.length > 0) {
            products = products.filter(p => selectedGenres.includes(p.categoryName));
        }

        // Platform Filter
        const selectedPlatforms = Array.isArray(filters.platform) ? filters.platform : (filters.platform ? [filters.platform] : []);
        if (selectedPlatforms.length > 0) {
            products = products.filter(p => p.platforms && p.platforms.some(plat => selectedPlatforms.includes(plat)));
        }

        // Publisher Filter
        const selectedPublishers = Array.isArray(filters.publisher) ? filters.publisher : (filters.publisher ? [filters.publisher] : []);
        if (selectedPublishers.length > 0) {
            products = products.filter(p => selectedPublishers.includes(p.publisher));
        }

        // Price Filter (Comparison in Paisa: e.g. 20 rupees = 2000 paisa)
        const selectedPrices = Array.isArray(filters.price) ? filters.price : (filters.price ? [filters.price] : []);
        if (selectedPrices.length > 0) {
            products = products.filter(p => {
                return selectedPrices.some(range => {
                    if (range === 'under-20') return p.price < 2000;
                    if (range === '20-40') return p.price >= 2000 && p.price <= 4000;
                    if (range === '40-70') return p.price >= 4000 && p.price <= 7000;
                    if (range === '70+') return p.price > 7000;
                    return false;
                });
            });
        }

        // Rating Filter
        const selectedRatings = Array.isArray(filters.rating) ? filters.rating : (filters.rating ? [filters.rating] : []);
        if (selectedRatings.length > 0) {
            products = products.filter(p => {
                return selectedRatings.some(threshold => {
                    const t = parseFloat(threshold);
                    return p.rating >= t;
                });
            });
        }

        if (filters.vault === 'standard') {
            products = products.filter(p => p.edition_type === 'STANDARD');
        } else if (filters.vault === 'legendary') {
            products = products.filter(p => p.edition_type === 'LEGENDARY');
        }

        products.sort((a, b) => {
            if (a.isEffectiveOutOfStock && !b.isEffectiveOutOfStock) return 1;
            if (!a.isEffectiveOutOfStock && b.isEffectiveOutOfStock) return -1;

            // Sort option checks
            if (sort === 'Price: Low to High') {
                return a.price - b.price;
            } else if (sort === 'Price: High to Low') {
                return b.price - a.price;
            } else if (sort === 'A-Z') {
                return a.title.localeCompare(b.title);
            } else if (sort === 'Z-A') {
                return b.title.localeCompare(a.title);
            } else {
                if (b.rating !== a.rating) {
                    return b.rating - a.rating;
                }
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        // 7. Pagination
        const totalCount = products.length;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedProducts = products.slice(startIndex, startIndex + limitNum);
        const totalPages = Math.ceil(totalCount / limitNum);

        return {
            products: paginatedProducts,
            currentPage: pageNum,
            totalPages,
            totalCount,
            limit: limitNum,
            dbPlatforms,
            dbPublishers,
            dbCategories: categories.map(c => c.name)
        };
    } catch (error) {
        console.error('[getBrowseProductsAndFilters] Error:', error);
        throw error;
    }
};

export const getProductsForHome = async (primaryPlatform = 'PC') => {
    try {
        const [categories, activeOffers] = await Promise.all([
            Category.find({}).lean(),
            getActiveOffers()
        ]);
        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        const mapProduct = (game) => {
            if (!game) return null;
            const catObj = game.category ? categoryMap.get(game.category.toString()) : null;
            
            let basePrice = game.price || 0;
            if (game.platform_stock && game.platform_stock.length > 0) {
                const platStock = game.platform_stock.find(ps => ps.platform.toLowerCase() === primaryPlatform.toLowerCase());
                if (platStock && typeof platStock.price === 'number') {
                    basePrice = platStock.price;
                } else {
                    const firstPlat = game.platform_stock[0];
                    if (firstPlat && typeof firstPlat.price === 'number') {
                        basePrice = firstPlat.price;
                    }
                }
            }

            const offerResult = calculateBestOfferForProduct(game, activeOffers, basePrice);
            const rating = game.avgRating || 0;
            const reviewsCount = game.reviewCount || 0;

            return {
                ...game,
                price: basePrice,
                coverImageUrl: game.cover_image || null,
                categoryName: catObj ? catObj.name : 'N/A',
                discountedPrice: offerResult.discountedPrice,
                offerDiscount: offerResult.discountPercentage,
                categoryDiscount: offerResult.discountPercentage,
                appliedOffer: offerResult.appliedOffer,
                rating: rating.toFixed(1),
                reviewsCount: `(${reviewsCount})`
            };
        };

        const rawLive = await Product.find({ status: 'Live', stock: { $gt: 0 } }).sort({ createdAt: -1 }).lean();
        
        const sortedLive = [...rawLive].sort((a, b) => {
            const isAvailA = (a.platforms && a.platforms.some(p => p.toLowerCase() === primaryPlatform.toLowerCase())) &&
                (!a.platform_stock || a.platform_stock.length === 0 || ((a.platform_stock.find(p => p.platform.toLowerCase() === primaryPlatform.toLowerCase()) || {}).stock > 0));

            const isAvailB = (b.platforms && b.platforms.some(p => p.toLowerCase() === primaryPlatform.toLowerCase())) &&
                (!b.platform_stock || b.platform_stock.length === 0 || ((b.platform_stock.find(p => p.platform.toLowerCase() === primaryPlatform.toLowerCase()) || {}).stock > 0));

            if (isAvailA && !isAvailB) return -1;
            if (!isAvailA && isAvailB) return 1;
            return 0;
        });

        const rawLatest = sortedLive.length > 0 ? sortedLive[0] : null;
        const latestRelease = mapProduct(rawLatest);

        const standardGames = sortedLive
            .filter(g => g.edition_type === 'STANDARD')
            .slice(0, 6)
            .map(mapProduct);

        const legendaryGames = sortedLive
            .filter(g => g.edition_type === 'LEGENDARY')
            .slice(0, 6)
            .map(mapProduct);

        return {
            latestRelease,
            standardGames,
            legendaryGames
        };
    } catch (error) {
        console.error('[getProductsForHome] Error:', error);
        throw error;
    }
};

export const getActivePublishersWithGameCount = async () => {
    try {
        const activePublishers = await Publisher.find({ is_listed: { $ne: false } }).lean();
        const enrichedPublishers = await Promise.all(activePublishers.map(async (pub) => {
            const gameCount = await Product.countDocuments({ publisher: pub.name, status: 'Live' });
            return {
                ...pub,
                gameCount
            };
        }));

        enrichedPublishers.sort((a, b) => b.gameCount - a.gameCount);
        return enrichedPublishers;
    } catch (error) {
        console.error('[getActivePublishersWithGameCount] Error:', error);
        throw error;
    }
};

export const getRecommendationsForProduct = async (categoryId, currentProductId, primaryPlatform = 'PC') => {
    try {
        const categories = await Category.find({ status: 'Live' }).lean();
        const categoryMap = new Map();
        const categoryNameMap = new Map();
        
        categories.forEach(c => {
            categoryMap.set(c._id.toString(), c);
            categoryNameMap.set(c.name.toLowerCase(), c);
        });

        let catObj = null;
        if (categoryId) {
            const catIdStr = categoryId.toString();
            if (mongoose.isValidObjectId(catIdStr)) {
                catObj = categoryMap.get(catIdStr);
            } else {
                catObj = categoryNameMap.get(catIdStr.toLowerCase());
            }
        }
        
        const currentCategoryName = catObj ? catObj.name.toLowerCase() : '';

        const [rawProducts, activeOffers] = await Promise.all([
            Product.find({
                status: 'Live',
                _id: { $ne: currentProductId }
            }).lean(),
            getActiveOffers()
        ]);

        const enrichedProducts = rawProducts.map(game => {
            let gameCatObj = null;
            if (game.category) {
                const gameCatStr = game.category.toString();
                if (mongoose.isValidObjectId(gameCatStr)) {
                    gameCatObj = categoryMap.get(gameCatStr);
                } else {
                    gameCatObj = categoryNameMap.get(gameCatStr.toLowerCase());
                }
            }

            let basePrice = game.price || 0;
            if (game.platform_stock && game.platform_stock.length > 0) {
                const platStock = game.platform_stock.find(ps => ps.platform === primaryPlatform);
                if (platStock && typeof platStock.price === 'number') {
                    basePrice = platStock.price;
                } else {
                    const firstPlat = game.platform_stock[0];
                    if (firstPlat && typeof firstPlat.price === 'number') {
                        basePrice = firstPlat.price;
                    }
                }
            }

            const offerResult = calculateBestOfferForProduct(game, activeOffers, basePrice);

            return {
                ...game,
                price: basePrice,
                categoryName: gameCatObj ? gameCatObj.name : 'N/A',
                discountedPrice: offerResult.discountedPrice,
                offerDiscount: offerResult.discountPercentage,
                categoryDiscount: offerResult.discountPercentage,
                appliedOffer: offerResult.appliedOffer
            };
        });

        let sameCategoryGames = enrichedProducts.filter(p => {
            return p.categoryName !== 'N/A' && p.categoryName.toLowerCase() === currentCategoryName;
        });

        let recommendations = sameCategoryGames.slice(0, 5);

        return recommendations;
    } catch (error) {
        console.error('[getRecommendationsForProduct] Error:', error);
        throw error;
    }
};

export const getDistinctPlatforms = async () => {
    try {
        return await Product.distinct('platforms');
    } catch (error) {
        console.error('[productService.getDistinctPlatforms] Error:', error);
        throw error;
    }
};

export const getProductDetailsForUser = async (productId, userId = null, primaryPlatform = 'PC') => {
    try {
        const product = await Product.findById(productId).lean();
        if (!product || product.status === 'Hidden') {
            return null;
        }

        let catObj = null;
        if (product.category) {
            if (mongoose.Types.ObjectId.isValid(product.category)) {
                catObj = await Category.findById(product.category).lean();
            } else {
                catObj = await Category.findOne({ name: product.category }).lean();
            }
        }
        product.categoryName = catObj ? catObj.name : 'N/A';
        const activeOffers = await getActiveOffers();
        const offerResult = calculateBestOfferForProduct(product, activeOffers, product.price);
        product.offerDiscount = offerResult.discountPercentage;
        product.categoryDiscount = offerResult.discountPercentage;
        product.discountedPrice = offerResult.discountedPrice;
        product.appliedOffer = offerResult.appliedOffer;

        let user = null;
        let inWishlist = false;
        let wishlistPlatforms = [];
        if (userId) {
            user = await User.findById(userId).select('-password_hash').lean();
            const wishlist = await Wishlist.findOne({ userId });
            if (wishlist) {
                wishlistPlatforms = wishlist.items
                    .filter(item => item.product && item.product.toString() === productId.toString())
                    .map(item => (item.platform || 'PC').toLowerCase());
                inWishlist = wishlistPlatforms.length > 0;
            }
        }

        const similarGames = await getRecommendationsForProduct(product.category, product._id, primaryPlatform);

        return {
            product,
            user,
            inWishlist,
            wishlistPlatforms,
            similarGames
        };
    } catch (error) {
        console.error('[productService.getProductDetailsForUser] Error:', error);
        throw error;
    }
};

export const getProductStatus = async (productId) => {
    try {
        const product = await Product.findById(productId).lean();
        return product ? product.status : null;
    } catch (error) {
        console.error('[productService.getProductStatus] Error:', error);
        throw error;
    }
};

export const getStorefrontActiveOffers = async (primaryPlatform = 'PC') => {
    try {
        const activeOffers = await getActiveOffers();
        if (!activeOffers || activeOffers.length === 0) return [];

        const categories = await Category.find({ status: 'Live' }).lean();
        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        const now = new Date();

        const formatExpiryText = (expiryDate) => {
            const exp = new Date(expiryDate);
            const diffMs = exp - now;
            if (diffMs <= 0) return 'Expired';

            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (days > 0) return `Expires in ${days}d ${hours}h`;
            if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
            return `Expires in ${minutes}m`;
        };

        const formatDateDisplay = (date) => {
            if (!date) return '';
            const d = new Date(date);
            const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
            return d.toLocaleDateString('en-GB', options);
        };

        const enrichedOffers = await Promise.all(activeOffers.map(async (offer) => {
            let discountDisplay = '';
            if (offer.discountType === 'percentage') {
                discountDisplay = `${offer.discountValue}% OFF`;
            } else {
                discountDisplay = `₹${(offer.discountValue / 100).toFixed(2)} OFF`;
            }

            let targetName = 'Special Deal';
            let targetIcon = 'fa-tags';
            let browseUrl = '/browse';

            let rawMatchingProducts = [];

            if (offer.targetType === 'Category' && offer.targetCategory) {
                const catObj = categoryMap.get(offer.targetCategory.toString());
                targetName = catObj ? catObj.name : 'Category';
                targetIcon = 'fa-layer-group';
                browseUrl = `/browse?genre=${encodeURIComponent(targetName)}`;
                rawMatchingProducts = await Product.find({ category: offer.targetCategory, status: 'Live' }).limit(4).lean();
            } else if (offer.targetType === 'Product' && offer.targetProduct) {
                const prodObj = await Product.findById(offer.targetProduct).lean();
                if (prodObj && prodObj.status === 'Live') {
                    targetName = prodObj.title;
                    targetIcon = 'fa-gamepad';
                    browseUrl = `/products/${prodObj._id}`;
                    rawMatchingProducts = [prodObj];
                }
            } else if (offer.targetType === 'Publisher' && offer.targetPublisher) {
                targetName = offer.targetPublisher;
                targetIcon = 'fa-building';
                browseUrl = `/browse?publisher=${encodeURIComponent(offer.targetPublisher)}`;
                rawMatchingProducts = await Product.find({ publisher: offer.targetPublisher, status: 'Live' }).limit(4).lean();
            }

            const matchingProducts = rawMatchingProducts.map(game => {
                let basePrice = game.price || 0;
                if (game.platform_stock && game.platform_stock.length > 0) {
                    const platStock = game.platform_stock.find(ps => ps.platform.toLowerCase() === primaryPlatform.toLowerCase());
                    if (platStock && typeof platStock.price === 'number') {
                        basePrice = platStock.price;
                    }
                }

                const offerResult = calculateBestOfferForProduct(game, [offer], basePrice);

                return {
                    ...game,
                    price: basePrice,
                    discountedPrice: offerResult.discountedPrice,
                    offerDiscount: offerResult.discountPercentage,
                    coverImageUrl: game.cover_image || game.coverImage || null
                };
            });

            return {
                ...offer,
                targetName,
                targetIcon,
                discountDisplay,
                browseUrl,
                expiresInText: formatExpiryText(offer.expiryDate),
                formattedExpiry: formatDateDisplay(offer.expiryDate),
                matchingProducts
            };
        }));

        return enrichedOffers;
    } catch (error) {
        console.error('[productService.getStorefrontActiveOffers] Error:', error);
        return [];
    }
};
