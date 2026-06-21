import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Publisher from '../models/Publisher.js';

export const getAllAdminProducts = async (search = '', filters = {}, sort = 'A-Z', page = 1, limit = 10) => {
    try {
        const query = {};

        // Title search (case-insensitive regex)
        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }

        // Apply edition_type filter
        if (filters.type && filters.type !== 'All') {
            query.edition_type = filters.type;
        }

        // Apply platform filter
        if (filters.platform && filters.platform !== 'All') {
            query.platforms = filters.platform;
        }

        // Apply developer (publisher) filter
        if (filters.developer && filters.developer !== 'All') {
            query.publisher = filters.developer;
        }

        // Apply status filter
        if (filters.status && filters.status !== 'All') {
            query.status = filters.status;
        }

        // Sort configuration
        let sortConfig = { createdAt: -1 };
        if (sort === 'A-Z') {
            sortConfig = { title: 1 };
        } else if (sort === 'Z-A') {
            sortConfig = { title: -1 };
        } else if (sort === 'Price-Low') {
            sortConfig = { price: 1 };
        } else if (sort === 'Price-High') {
            sortConfig = { price: -1 };
        }

        // Fetch products from database safely
        const rawProducts = await Product.find(query)
            .sort(sortConfig)
            .lean();

        // Fetch categories to build the mapping
        const categories = await Category.find({}).lean();
        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        // Fetch distinct platforms and publishers (developers) in the entire database
        const dbPlatforms = await Product.distinct('platforms');
        const dbPublishers = await Product.distinct('publisher');

        // Map categories and cover images
        const productsMapped = rawProducts.map(game => {
            const catObj = game.category ? categoryMap.get(game.category.toString()) : null;
            const discount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
            let discountedPrice = game.price || 0;
            if (discount > 0) {
                discountedPrice = Math.max(0, game.price - (game.price * (discount / 100)));
            }
            return {
                ...game,
                coverImageUrl: game.cover_image || game.coverImage || null,
                categoryName: catObj ? catObj.name : 'N/A',
                discountedPrice: discountedPrice,
                categoryDiscount: discount
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

export const createProduct = async (productData) => {
    try {
        const product = new Product(productData);
        return await product.save();
    } catch (error) {
        console.error('[productService.createProduct] Error:', error);
        throw error;
    }
};

export const getProductById = async (id) => {
    try {
        return await Product.findById(id).lean();
    } catch (error) {
        console.error('[productService.getProductById] Error:', error);
        throw error;
    }
};

export const updateProduct = async (id, productData) => {
    try {
        return await Product.findByIdAndUpdate(id, productData, { new: true, runValidators: true });
    } catch (error) {
        console.error('[productService.updateProduct] Error:', error);
        throw error;
    }
};

// Deterministic mock rating helper
const getProductRating = (product) => {
    let hash = 0;
    const str = product.title || '';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const rating = 3.5 + Math.abs(hash % 16) * 0.1; // 3.5 to 5.0
    return parseFloat(rating.toFixed(1));
};

// Deterministic mock reviews helper
const getProductReviewsCount = (product) => {
    let hash = 0;
    const str = product.title || '';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const reviews = Math.abs(hash % 950) + 50; // 50 to 1000
    return `(${reviews})`;
};

export const getBrowseProductsAndFilters = async (search = '', filters = {}, sort = 'Trending', page = 1, limit = 12, primaryPlatform = 'PC') => {
    try {
        // 1. Fetch Categories
        const categories = await Category.find({ status: 'Live' }).lean();
        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        // 2. Fetch Live Products
        const rawProducts = await Product.find({ status: 'Live' }).lean();

        // 3. Extract distinct platforms and publishers dynamically from live products and database
        const allPlatforms = new Set();
        const allPublishers = new Set();
        
        // Include saved publishers from the collection
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

        // 4. Map Category names, covers, deterministic ratings, and discounted prices
        let products = rawProducts.map(game => {
            const catObj = game.category ? categoryMap.get(game.category.toString()) : null;
            const discount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
            
            // Resolve platform specific price
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

            let discountedPrice = basePrice;
            if (discount > 0) {
                discountedPrice = Math.max(0, basePrice - (basePrice * (discount / 100)));
            }
            return {
                ...game,
                price: basePrice,
                coverImageUrl: game.cover_image || game.coverImage || null,
                categoryName: catObj ? catObj.name : 'N/A',
                discountedPrice: discountedPrice,
                categoryDiscount: discount,
                rating: getProductRating(game),
                reviewsCount: getProductReviewsCount(game)
            };
        });

        // 5. In-Memory Filtering
        // Search Filter
        if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            products = products.filter(p => p.title.toLowerCase().includes(s));
        }

        // Genre / Category Filter
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

        // Price Filter
        const selectedPrices = Array.isArray(filters.price) ? filters.price : (filters.price ? [filters.price] : []);
        if (selectedPrices.length > 0) {
            products = products.filter(p => {
                return selectedPrices.some(range => {
                    if (range === 'under-20') return p.price < 20;
                    if (range === '20-40') return p.price >= 20 && p.price <= 40;
                    if (range === '40-70') return p.price >= 40 && p.price <= 70;
                    if (range === '70+') return p.price > 70;
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

        // Vault / Edition Filter
        if (filters.vault === 'standard') {
            products = products.filter(p => p.edition_type === 'STANDARD');
        } else if (filters.vault === 'legendary') {
            products = products.filter(p => p.edition_type === 'LEGENDARY');
        }

        // 6. In-Memory Sorting (Out-of-stock items always come last)
        products.sort((a, b) => {
            // Out of stock sorting: stock === 0 comes last
            if (a.stock === 0 && b.stock > 0) return 1;
            if (a.stock > 0 && b.stock === 0) return -1;

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
                // Trending (sort by rating and then createdAt)
                if (b.rating !== a.rating) {
                    return b.rating - a.rating;
                }
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        // 7. Paginate
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
        const categories = await Category.find({}).lean();
        const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));

        const mapProduct = (game) => {
            if (!game) return null;
            const catObj = game.category ? categoryMap.get(game.category.toString()) : null;
            const discount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
            
            // Resolve platform specific price
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

            let discountedPrice = basePrice;
            if (discount > 0) {
                discountedPrice = Math.max(0, basePrice - (basePrice * (discount / 100)));
            }
            // Generate a rating between 4.0 and 5.0 deterministically or use fallback
            const rating = 4.0 + (Math.abs(game.title.charCodeAt(0) || 0) % 11) / 10;
            const reviewsCount = 50 + (Math.abs(game.title.charCodeAt(1) || 0) % 250);

            return {
                ...game,
                price: basePrice,
                coverImageUrl: game.cover_image || null,
                categoryName: catObj ? catObj.name : 'N/A',
                discountedPrice: discountedPrice,
                categoryDiscount: discount,
                rating: rating.toFixed(1),
                reviewsCount: `(${reviewsCount})`
            };
        };

        // Find latest release banner (standard or legendary)
        const rawLatest = await Product.findOne({ status: 'Live' }).sort({ createdAt: -1 }).lean();
        const latestRelease = mapProduct(rawLatest);

        // Find standard games
        const rawStandard = await Product.find({ status: 'Live', edition_type: 'STANDARD' })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();
        const standardGames = rawStandard.map(mapProduct);

        // Find legendary games
        const rawLegendary = await Product.find({ status: 'Live', edition_type: 'LEGENDARY' })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();
        const legendaryGames = rawLegendary.map(mapProduct);

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
        // Fetch all categories to map category ID / name
        const categories = await Category.find({ status: 'Live' }).lean();
        const categoryMap = new Map();
        const categoryNameMap = new Map();
        
        categories.forEach(c => {
            categoryMap.set(c._id.toString(), c);
            categoryNameMap.set(c.name.toLowerCase(), c);
        });

        // Find the category of the current product
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

        // Fetch all live products (except the current one)
        const rawProducts = await Product.find({
            status: 'Live',
            _id: { $ne: currentProductId }
        }).lean();

        // Map and enrich products in memory
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

            // Resolve platform specific price
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

            const discount = (gameCatObj && gameCatObj.defaultOffer) ? parseFloat(gameCatObj.defaultOffer) : 0;
            let discountedPrice = basePrice;
            if (discount > 0) {
                discountedPrice = Math.max(0, basePrice - (basePrice * (discount / 100)));
            }

            return {
                ...game,
                price: basePrice,
                categoryName: gameCatObj ? gameCatObj.name : 'N/A',
                discountedPrice,
                categoryDiscount: discount
            };
        });

        // Filter: games of the same category
        let sameCategoryGames = enrichedProducts.filter(p => {
            return p.categoryName !== 'N/A' && p.categoryName.toLowerCase() === currentCategoryName;
        });

        // Fallback to other categories if less than 5
        let recommendations = sameCategoryGames.slice(0, 5);
        if (recommendations.length < 5) {
            const currentRecIds = new Set(recommendations.map(r => r._id.toString()));
            const fallbackGames = enrichedProducts.filter(p => !currentRecIds.has(p._id.toString()));
            recommendations = recommendations.concat(fallbackGames.slice(0, 5 - recommendations.length));
        }

        return recommendations;
    } catch (error) {
        console.error('[getRecommendationsForProduct] Error:', error);
        throw error;
    }
};

