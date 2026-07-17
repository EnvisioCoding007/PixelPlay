import Cart from '../models/Cart.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Wishlist from '../models/Wishlist.js';
import mongoose from 'mongoose';

export const getCartItemCount = async (userId) => {
    if (!userId) return 0;
    const cart = await Cart.findOne({ userId });
    if (cart && cart.items) {
        return cart.items.reduce((acc, item) => acc + item.quantity, 0);
    }
    return 0;
};

export const getCartDetails = async (userId) => {
    let cart = await Cart.findOne({ userId }).populate('items.product').lean();
    if (!cart) {
        cart = { items: [] };
    }

    let subtotal = 0;
    let discount = 0;
    let hasUnavailableProduct = false;
    let hasInsufficientStockProduct = false;
    for (let item of cart.items) {
        if (item.product) {
            item.product = { ...item.product };
            if (item.product.status === 'Hidden') {
                hasUnavailableProduct = true;
            }
            let catObj = null;
            if (item.product.category) {
                if (mongoose.Types.ObjectId.isValid(item.product.category)) {
                    catObj = await Category.findById(item.product.category).lean();
                } else {
                    catObj = await Category.findOne({ name: item.product.category }).lean();
                }
            }
            const catDiscount = (catObj && catObj.defaultOffer) ? parseFloat(catObj.defaultOffer) : 0;
            item.product.categoryDiscount = catDiscount;
            
            let basePrice = item.product.price || 0;
            let platformStock = item.product.stock || 0;
            if (item.product.platform_stock && item.product.platform_stock.length > 0) {
                const platStock = item.product.platform_stock.find(ps => ps.platform.toLowerCase() === item.platform.toLowerCase());
                if (platStock && typeof platStock.price === 'number') {
                    basePrice = platStock.price;
                    platformStock = platStock.stock;
                } else {
                    const firstPlat = item.product.platform_stock[0];
                    if (firstPlat && typeof firstPlat.price === 'number') {
                        basePrice = firstPlat.price;
                        platformStock = firstPlat.stock;
                    }
                }
            }
            
            item.product.stock = platformStock;
            if (item.quantity > platformStock) {
                hasInsufficientStockProduct = true;
            }
            
            const activePrice = catDiscount > 0 ? Math.round(Math.max(0, basePrice - (basePrice * (catDiscount / 100)))) : basePrice;
            const cartPrice = Math.round(activePrice * 0.82);
            item.product.price = cartPrice;
            item.product.displayPrice = activePrice;
            subtotal += cartPrice * item.quantity;
        }
    }

    const tax = Math.round(subtotal * (18 / 82));
    const shipping = cart.items.length > 0 ? 10000 : 0;
    const grandTotal = subtotal - discount + tax + shipping;

    return {
        cart,
        subtotal: Math.round(subtotal),
        tax: Math.round(tax),
        shipping: Math.round(shipping),
        discount: Math.round(discount),
        grandTotal: Math.round(grandTotal),
        hasUnavailableProduct,
        hasInsufficientStockProduct
    };
};

export const getCartItems = async (userId) => {
    try {
        const cart = await Cart.findOne({ userId }).lean();
        if (cart && cart.items) {
            return cart.items.map(item => ({
                productId: item.product.toString(),
                platform: item.platform,
                quantity: item.quantity
            }));
        }
        return [];
    } catch (error) {
        console.error('[cartService.getCartItems] Error:', error);
        throw error;
    }
};

export const addToCart = async (userId, productId, platform, quantity) => {
    try {
        const product = await Product.findById(productId);
        if (!product || product.status === 'Hidden') {
            const err = new Error('This product is currently unavailable.');
            err.redirectUrl = '/browse';
            throw err;
        }

        const qty = Number(quantity) || 1;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString() && 
            (item.platform || 'PC').toLowerCase() === platform.toLowerCase()
        );

        let platformStock = product.stock || 0;
        if (product.platform_stock && product.platform_stock.length > 0) {
            const platStock = product.platform_stock.find(ps => ps.platform.toLowerCase() === platform.toLowerCase());
            if (platStock) {
                platformStock = platStock.stock;
            }
        }

        if (itemIndex > -1) {
            const newQty = cart.items[itemIndex].quantity + qty;
            if (newQty > 3) {
                throw new Error('Maximum of 3 should be the limit to add to cart.');
            }
            if (newQty > platformStock) {
                throw new Error(`Only ${platformStock} items available in stock.`);
            }
            cart.items[itemIndex].quantity = newQty;
        } else {
            if (qty > 3) {
                throw new Error('Maximum of 3 should be the limit to add to cart.');
            }
            if (qty > platformStock) {
                throw new Error(`Only ${platformStock} items available in stock.`);
            }
            cart.items.push({ product: productId, platform, quantity: qty });
        }

        await cart.save();
        const cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);

        // Remove from wishlist if it exists there
        let wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            wishlist.items.forEach(item => {
                if (!item.platform) {
                    item.platform = 'PC';
                }
            });
            const wlIndex = wishlist.items.findIndex(item => 
                item.product &&
                item.product.toString() === productId.toString() &&
                item.platform.toLowerCase() === platform.toLowerCase()
            );
            if (wlIndex > -1) {
                wishlist.items.splice(wlIndex, 1);
                await wishlist.save();
            }
        }

        return { cartCount };
    } catch (error) {
        console.error('[cartService.addToCart] Error:', error);
        throw error;
    }
};

export const updateCartQuantity = async (userId, productId, platform, action) => {
    try {
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            throw new Error('Cart not found.');
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString() && 
            (item.platform || 'PC').toLowerCase() === platform.toLowerCase()
        );

        if (itemIndex === -1) {
            throw new Error('Item not found in cart.');
        }

        const product = await Product.findById(productId);
        if (!product || product.status === 'Hidden') {
            throw new Error('Product is currently unavailable.');
        }

        let platformStock = product.stock || 0;
        if (product.platform_stock && product.platform_stock.length > 0) {
            const platStock = product.platform_stock.find(ps => ps.platform.toLowerCase() === platform.toLowerCase());
            if (platStock) {
                platformStock = platStock.stock;
            }
        }

        if (action === 'increase') {
            const currentQty = cart.items[itemIndex].quantity;
            if (currentQty >= 3) {
                throw new Error('Maximum of 3 should be the limit to add to cart.');
            }
            if (currentQty >= platformStock) {
                throw new Error(`Only ${platformStock} items available in stock.`);
            }
            cart.items[itemIndex].quantity += 1;
        } else if (action === 'decrease') {
            if (cart.items[itemIndex].quantity > 1) {
                cart.items[itemIndex].quantity -= 1;
            } else {
                throw new Error('Minimum quantity limit reached.');
            }
        }
        await cart.save();

        const cartDetails = await getCartDetails(userId);
        const itemsData = cartDetails.cart.items.map(item => {
            const itemSubtotal = item.product.price * item.quantity;
            return {
                productId: item.product._id.toString(),
                platform: item.platform || 'PC',
                quantity: item.quantity,
                price: item.product.price,
                displayPrice: item.product.displayPrice,
                itemSubtotal: itemSubtotal,
                isMinQty: item.quantity <= 1,
                isMaxQty: item.quantity >= 3 || item.quantity >= item.product.stock,
                stock: item.product.stock
            };
        });

        const cartCount = cartDetails.cart.items.reduce((acc, item) => acc + item.quantity, 0);

        return {
            cartCount,
            subtotal: cartDetails.subtotal,
            tax: cartDetails.tax,
            shipping: cartDetails.shipping,
            grandTotal: cartDetails.grandTotal,
            hasUnavailableProduct: cartDetails.hasUnavailableProduct,
            items: itemsData
        };
    } catch (error) {
        console.error('[cartService.updateCartQuantity] Error:', error);
        throw error;
    }
};

export const removeFromCart = async (userId, productId, platform) => {
    try {
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            throw new Error('Cart not found.');
        }

        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId.toString() && 
            (item.platform || 'PC').toLowerCase() === platform.toLowerCase()
        );

        if (itemIndex === -1) {
            throw new Error('Item not found in cart.');
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();
        const cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
        return { cartCount };
    } catch (error) {
        console.error('[cartService.removeFromCart] Error:', error);
        throw error;
    }
};

