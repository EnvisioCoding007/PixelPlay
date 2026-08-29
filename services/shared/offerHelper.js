import Offer from '../../models/Offer.js';

/**
 * Fetches all currently active and valid offers from the database.
 */
export const getActiveOffers = async () => {
    try {
        const now = new Date();
        return await Offer.find({
            isActive: true,
            startDate: { $lte: now },
            expiryDate: { $gte: now }
        }).lean();
    } catch (error) {
        console.error('[offerHelper.getActiveOffers] Error:', error);
        return [];
    }
};

/**
 * Computes the best applicable offer for a single product.
 * 
 * @param {Object} product - Product object (must contain _id, category, publisher, and base price in paisa)
 * @param {Array<Object>} activeOffers - Pre-fetched array of active offer documents
 * @param {number} [customBasePrice=null] - Optional base price override in Paisa
 * @returns {Object} { discountPercentage, discountedPrice, discountPaisa, appliedOffer }
 */
export const calculateBestOfferForProduct = (product, activeOffers = [], customBasePrice = null) => {
    if (!product) {
        return {
            discountPercentage: 0,
            discountedPrice: 0,
            discountPaisa: 0,
            appliedOffer: null
        };
    }

    const basePrice = customBasePrice !== null && customBasePrice !== undefined
        ? Math.max(0, Math.round(Number(customBasePrice) || 0))
        : Math.max(0, Math.round(Number(product.price) || 0));

    if (basePrice === 0 || !activeOffers || activeOffers.length === 0) {
        return {
            discountPercentage: 0,
            discountedPrice: basePrice,
            discountPaisa: 0,
            appliedOffer: null
        };
    }

    const productIdStr = product._id ? product._id.toString() : (product.id ? product.id.toString() : '');
    const categoryIdStr = product.category
        ? (typeof product.category === 'object' && product.category._id ? product.category._id.toString() : product.category.toString())
        : '';
    const publisherNameStr = product.publisher ? String(product.publisher).trim().toLowerCase() : '';

    let maxDiscountPaisa = 0;
    let bestOffer = null;
    let bestPercentage = 0;

    for (const offer of activeOffers) {
        let isMatch = false;

        if (offer.targetType === 'Category' && offer.targetCategory && categoryIdStr) {
            const offerCatStr = offer.targetCategory._id ? offer.targetCategory._id.toString() : offer.targetCategory.toString();
            if (offerCatStr === categoryIdStr) {
                isMatch = true;
            }
        } else if (offer.targetType === 'Product' && offer.targetProduct && productIdStr) {
            const offerProdStr = offer.targetProduct._id ? offer.targetProduct._id.toString() : offer.targetProduct.toString();
            if (offerProdStr === productIdStr) {
                isMatch = true;
            }
        } else if (offer.targetType === 'Publisher' && offer.targetPublisher && publisherNameStr) {
            if (offer.targetPublisher.trim().toLowerCase() === publisherNameStr) {
                isMatch = true;
            }
        }

        if (isMatch) {
            let discountPaisa = 0;
            let percentage = 0;

            if (offer.discountType === 'percentage') {
                percentage = Math.min(100, Math.max(0, Number(offer.discountValue) || 0));
                discountPaisa = Math.round((basePrice * percentage) / 100);
            } else if (offer.discountType === 'flat') {
                discountPaisa = Math.min(basePrice, Math.max(0, Number(offer.discountValue) || 0));
                percentage = basePrice > 0 ? Math.min(100, Math.round((discountPaisa / basePrice) * 100)) : 0;
            }

            if (discountPaisa > maxDiscountPaisa) {
                maxDiscountPaisa = discountPaisa;
                bestOffer = offer;
                bestPercentage = percentage;
            }
        }
    }

    const discountedPrice = Math.max(0, basePrice - maxDiscountPaisa);

    return {
        discountPercentage: bestPercentage,
        discountedPrice,
        discountPaisa: maxDiscountPaisa,
        appliedOffer: bestOffer
    };
};

/**
 * Enhances an array of products with calculated offer discounts.
 * 
 * @param {Array<Object>} products 
 * @param {Array<Object>} [preloadedActiveOffers=null] 
 * @returns {Promise<Array<Object>>}
 */
export const applyOffersToProducts = async (products = [], preloadedActiveOffers = null) => {
    if (!products || products.length === 0) return [];
    
    const activeOffers = preloadedActiveOffers !== null 
        ? preloadedActiveOffers 
        : await getActiveOffers();

    return products.map(product => {
        const basePrice = product.price || 0;
        const offerResult = calculateBestOfferForProduct(product, activeOffers, basePrice);

        return {
            ...product,
            offerDiscount: offerResult.discountPercentage,
            categoryDiscount: offerResult.discountPercentage, // Retained for view backward compatibility
            discountedPrice: offerResult.discountedPrice,
            offerDiscountPaisa: offerResult.discountPaisa,
            appliedOffer: offerResult.appliedOffer
        };
    });
};
