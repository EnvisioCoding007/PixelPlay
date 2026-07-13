import * as productService from '../../services/productService.js';
import * as categoryService from '../../services/categoryService.js';
import * as publisherService from '../../services/publisherService.js';
import * as userService from '../../services/userService.js';
import * as wishlistService from '../../services/wishlistService.js';
import * as cartService from '../../services/cartService.js';

export const getHome = async (req, res) => {
    try {
        const categories = await categoryService.getAllActiveCategories();
        
        const primaryPlatform = req.session.primaryPlatform || 'PC';
        const allPlatforms = await productService.getDistinctPlatforms();
        if (!allPlatforms.includes('PC')) {
            allPlatforms.unshift('PC');
        }

        const { latestRelease, standardGames, legendaryGames } = await productService.getProductsForHome(primaryPlatform);
        const activePublishers = await productService.getActivePublishersWithGameCount();

        const publishers = activePublishers;

        let userWishlist = [];

        if (req.session.user) {
            const userId = req.session.user.id || req.session.user;
            const user = await userService.getUserById(userId);

            if (!user || user.is_blocked) {
                req.session.destroy(() => {});
                return res.render('user/home', { 
                    user: null, 
                    categories, 
                    publishers,
                    latestRelease,
                    standardGames,
                    legendaryGames,
                    activePublishers,
                    userWishlist: [],
                    primaryPlatform,
                    allPlatforms
                });
            }

            userWishlist = await wishlistService.getWishlistItems(userId);

            return res.render('user/home', { 
                user, 
                categories, 
                publishers,
                latestRelease,
                standardGames,
                legendaryGames,
                activePublishers,
                userWishlist,
                primaryPlatform,
                allPlatforms
            });
        }

        return res.render('user/home', { 
            user: null, 
            categories, 
            publishers,
            latestRelease,
            standardGames,
            legendaryGames,
            activePublishers,
            userWishlist: [],
            primaryPlatform,
            allPlatforms
        });
    } catch (error) {
        console.error('[getHome]', error);
        res.render('user/home', { 
            user: null, 
            categories: [], 
            publishers: [],
            latestRelease: null,
            standardGames: [],
            legendaryGames: [],
            activePublishers: [],
            userWishlist: []
        });
    }
};

export const getBrowsePage = async (req, res) => {
    try {
        const { search, genre, platform, price, rating, publisher, sort, vault, page, notification } = req.query;

        const queryGenre = Array.isArray(genre) ? genre : (genre ? [genre] : []);
        const queryPlatform = Array.isArray(platform) ? platform : (platform ? [platform] : []);
        const queryPrice = Array.isArray(price) ? price : (price ? [price] : []);
        const queryRating = Array.isArray(rating) ? rating : (rating ? [rating] : []);
        const queryPublisher = Array.isArray(publisher) ? publisher : (publisher ? [publisher] : []);

        const filters = {
            genre: queryGenre,
            platform: queryPlatform,
            price: queryPrice,
            rating: queryRating,
            publisher: queryPublisher,
            vault: vault || 'all'
        };

        const primaryPlatform = req.session.primaryPlatform || 'PC';
        const result = await productService.getBrowseProductsAndFilters(
            search || '',
            filters,
            sort || 'Trending',
            page || 1,
            8,
            primaryPlatform
        );

        let user = null;
        let userWishlist = [];
        let userCartItems = [];
        if (req.session.user) {
            const userId = req.session.user.id || req.session.user;
            user = await userService.getUserById(userId);
            userWishlist = await wishlistService.getWishlistItems(userId);
            userCartItems = await cartService.getCartItems(userId);
        }

        res.render('user/browse-games', {
            user,
            userWishlist,
            userCartItems,
            products: result.products,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            platforms: result.dbPlatforms,
            publishers: result.dbPublishers,
            categories: result.dbCategories,
            primaryPlatform,
            notification: notification || null,
            query: {
                search: search || '',
                genre: queryGenre,
                platform: queryPlatform,
                price: queryPrice,
                rating: queryRating,
                publisher: queryPublisher,
                sort: sort || 'Trending',
                vault: vault || 'all'
            }
        });
    } catch (error) {
        console.error('[getBrowsePage] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading products.'
        });
    }
};

export const getProductDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user ? (req.session.user.id || req.session.user) : null;
        const primaryPlatform = req.session.primaryPlatform || 'PC';

        const details = await productService.getProductDetailsForUser(id, userId, primaryPlatform);
        if (!details) {
            return res.redirect('/browse?notification=The game was unlisted by the admin.');
        }

        const reviews = [];

        res.render('user/game-details', {
            product: details.product,
            reviews,
            user: details.user,
            inWishlist: details.inWishlist,
            wishlistPlatforms: details.wishlistPlatforms,
            similarGames: details.similarGames,
            primaryPlatform
        });
    } catch (error) {
        console.error('[getProductDetails] Error:', error);
        res.status(500).render('user/home', {
            user: null,
            categories: [],
            publishers: [],
            error: 'An error occurred while loading game details.'
        });
    }
};

export const checkProductStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const status = await productService.getProductStatus(id);
        if (!status || status === 'Hidden') {
            return res.status(200).json({ status: 'Hidden', redirectUrl: '/browse' });
        }
        return res.status(200).json({ status: 'Live' });
    } catch (error) {
        console.error('[checkProductStatus] Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

export const setPrimaryPlatform = async (req, res) => {
    try {
        const { platform } = req.body;
        if (platform) {
            req.session.primaryPlatform = platform;
        }
        return res.redirect(req.headers.referer || '/home');
    } catch (error) {
        console.error('[setPrimaryPlatform] Error:', error);
        return res.redirect('/home');
    }
};
