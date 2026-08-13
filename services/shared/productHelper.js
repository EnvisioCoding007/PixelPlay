export const getProductRating = (product) => {
    let hash = 0;
    const str = product.title || '';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const rating = 3.5 + Math.abs(hash % 16) * 0.1; // 3.5 to 5.0
    return parseFloat(rating.toFixed(1));
};

export const getProductReviewsCount = (product) => {
    let hash = 0;
    const str = product.title || '';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const reviews = Math.abs(hash % 950) + 50; // 50 to 1000
    return `(${reviews})`;
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
