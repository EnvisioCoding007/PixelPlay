import Cart from '../models/Cart.js';
import Category from '../models/Category.js';
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
        hasUnavailableProduct
    };
};
