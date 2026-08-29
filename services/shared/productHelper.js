export const getProductRating = (product) => {
    if (!product || typeof product.avgRating === 'undefined') return 0;
    return parseFloat((product.avgRating || 0).toFixed(1));
};

export const getProductReviewsCount = (product) => {
    if (!product || typeof product.reviewCount === 'undefined') return '(0)';
    return `(${product.reviewCount || 0})`;
};

export const validateProductData = (data) => {
    const errors = {};

    if (!data.title || !data.title.trim()) {
        errors.title = 'Title is required';
    }

    if (!data.publisher || !data.publisher.trim()) {
        errors.publisher = 'Publisher is required';
    }

    if (!data.category || !data.category.trim()) {
        errors.category = 'Category is required';
    }

    const basePriceNum = parseFloat(data.price);
    if (isNaN(basePriceNum) || basePriceNum < 100) {
        errors.price = 'Base price must be at least ₹100.00';
    }

    if (data.platforms && Array.isArray(data.platforms)) {
        data.platforms.forEach(plat => {
            const stockKey = `stock_${plat}`;
            const priceKey = `price_${plat}`;
            const platStock = parseInt(data[stockKey], 10);
            const platPrice = parseFloat(data[priceKey]);

            if (isNaN(platStock) || platStock < 0) {
                errors[stockKey] = `Stock for ${plat} must be 0 or greater`;
            }
            if (isNaN(platPrice) || platPrice < 100) {
                errors[priceKey] = `Price for ${plat} must be at least ₹100.00`;
            }
        });
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};
