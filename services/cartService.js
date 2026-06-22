import Cart from '../models/Cart.js';

export const getCartItemCount = async (userId) => {
    if (!userId) return 0;
    const cart = await Cart.findOne({ userId });
    if (cart && cart.items) {
        return cart.items.reduce((acc, item) => acc + item.quantity, 0);
    }
    return 0;
};
