import mongoose from 'mongoose';
import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

export const getWishlistByUserId = async (userId) => {
    try {
        let wishlist = await Wishlist.findOne({ userId }).populate('items.product').lean();
        if (!wishlist) {
            return { items: [] };
        }
        wishlist.items = wishlist.items.filter(item => item.product);

        for (let item of wishlist.items) {
            if (item.product) {
                item.product = { ...item.product };
                let catObj = null;
                if (item.product.category) {
                    if (mongoose.Types.ObjectId.isValid(item.product.category)) {
                        catObj = await Category.findById(item.product.category).lean();
                    } else {
                        catObj = await Category.findOne({ name: item.product.category }).lean();
                    }
                }
                const discount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
                item.product.categoryDiscount = discount;
                
                let basePrice = item.product.price || 0;
                if (item.product.platform_stock && item.product.platform_stock.length > 0) {
                    const platStock = item.product.platform_stock.find(ps => ps.platform === item.platform);
                    if (platStock && typeof platStock.price === 'number') {
                        basePrice = platStock.price;
                    } else {
                        const firstPlat = item.product.platform_stock[0];
                        if (firstPlat && typeof firstPlat.price === 'number') {
                            basePrice = firstPlat.price;
                        }
                    }
                }
                
                item.product.price = basePrice;
                item.product.discountedPrice = discount > 0 ? Math.max(0, basePrice - (basePrice * (discount / 100))) : basePrice;
                item.product.categoryName = catObj ? catObj.name : 'N/A';
            }
        }
        return wishlist;
    } catch (error) {
        console.error('[wishlistService.getWishlistByUserId] Error:', error);
        throw error;
    }
};

export const getWishlistItems = async (userId) => {
    try {
        const wishlist = await Wishlist.findOne({ userId }).lean();
        if (wishlist && wishlist.items) {
            return wishlist.items
                .filter(item => item.product)
                .map(item => item.product.toString());
        }
        return [];
    } catch (error) {
        console.error('[wishlistService.getWishlistItems] Error:', error);
        throw error;
    }
};

export const toggleWishlist = async (userId, productId, platform) => {
    try {
        const product = await Product.findById(productId).lean();
        if (!product || product.status === 'Hidden') {
            const err = new Error('This product is currently unavailable.');
            err.redirectUrl = '/browse';
            throw err;
        }

        let selectedPlatform = platform;
        if (!selectedPlatform) {
            selectedPlatform = (product.platforms && product.platforms.length > 0) ? product.platforms[0] : 'PC';
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        } else {
            wishlist.items.forEach(item => {
                if (!item.platform) {
                    item.platform = 'PC';
                }
            });
        }

        const itemIndex = wishlist.items.findIndex(item => 
            item.product &&
            item.product.toString() === productId.toString() &&
            item.platform.toLowerCase() === selectedPlatform.toLowerCase()
        );
        let added = false;
        if (itemIndex > -1) {
            wishlist.items.splice(itemIndex, 1);
        } else {
            wishlist.items.push({ product: productId, platform: selectedPlatform });
            added = true;
        }

        await wishlist.save();
        return { added };
    } catch (error) {
        console.error('[wishlistService.toggleWishlist] Error:', error);
        throw error;
    }
};
