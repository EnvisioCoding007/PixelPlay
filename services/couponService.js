import Coupon from '../models/Coupon.js';

/**
 * Creates a new coupon in the database.
 * 
 * @param {object} data - Raw form inputs
 * @returns {Promise<object>} Created coupon document
 */
export const createCoupon = async (data) => {
    const {
        code,
        description,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        expiryDate,
        totalUsageLimit,
        userUsageLimit
    } = data;

    if (!code || !code.trim()) {
        throw new Error('Coupon code is required.');
    }

    const formattedCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ code: formattedCode });
    if (existing) {
        throw new Error(`Coupon code "${formattedCode}" already exists.`);
    }

    if (!discountType || !['percentage', 'flat'].includes(discountType)) {
        throw new Error('Valid discount type (Percentage or Flat) is required.');
    }

    const numericDiscount = parseFloat(discountValue);
    if (isNaN(numericDiscount) || numericDiscount <= 0) {
        throw new Error('Discount value must be greater than zero.');
    }

    if (discountType === 'percentage' && numericDiscount > 100) {
        throw new Error('Percentage discount cannot exceed 100%.');
    }

    if (!expiryDate) {
        throw new Error('Expiry date is required.');
    }

    let parsedExpiry;
    if (typeof expiryDate === 'string' && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(expiryDate.trim())) {
        const [day, month, year] = expiryDate.trim().split(/[/-]/);
        parsedExpiry = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 23, 59, 59);
    } else {
        parsedExpiry = new Date(expiryDate);
    }

    if (isNaN(parsedExpiry.getTime())) {
        throw new Error('Invalid expiry date provided. Please use DD/MM/YYYY format.');
    }
    if (parsedExpiry <= new Date()) {
        throw new Error('Expiry date must be in the future.');
    }

    // Convert Rupees inputs to Paisa for monetary fields
    // If discountType is 'flat', store discountValue in Paisa (multiplied by 100)
    const storedDiscountValue = discountType === 'flat' 
        ? Math.round(numericDiscount * 100) 
        : numericDiscount;

    const storedMinOrderAmount = minOrderAmount && parseFloat(minOrderAmount) > 0 
        ? Math.round(parseFloat(minOrderAmount) * 100) 
        : 0;

    const storedMaxDiscountAmount = maxDiscountAmount && parseFloat(maxDiscountAmount) > 0 
        ? Math.round(parseFloat(maxDiscountAmount) * 100) 
        : null;

    const storedTotalUsageLimit = totalUsageLimit && parseInt(totalUsageLimit, 10) > 0 
        ? parseInt(totalUsageLimit, 10) 
        : null;

    const storedUserUsageLimit = userUsageLimit && parseInt(userUsageLimit, 10) > 0 
        ? parseInt(userUsageLimit, 10) 
        : 1;

    const coupon = new Coupon({
        code: formattedCode,
        description: description ? description.trim() : '',
        discountType,
        discountValue: storedDiscountValue,
        minOrderAmount: storedMinOrderAmount,
        maxDiscountAmount: storedMaxDiscountAmount,
        expiryDate: parsedExpiry,
        totalUsageLimit: storedTotalUsageLimit,
        userUsageLimit: storedUserUsageLimit,
        isActive: true
    });

    await coupon.save();
    return coupon;
};

/**
 * Retrieves paginated coupons list for the admin dashboard.
 * 
 * @param {object} filters - Filter criteria
 * @returns {Promise<object>} Paginated results
 */
export const getCouponsAdminPaginated = async ({ search = '', status = 'All', type = 'All', page = 1, limit = 10 }) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (search && search.trim()) {
        query.code = { $regex: search.trim(), $options: 'i' };
    }

    if (status && status !== 'All') {
        if (status.toLowerCase() === 'active') {
            query.isActive = true;
        } else if (status.toLowerCase() === 'inactive') {
            query.isActive = false;
        }
    }

    if (type && type !== 'All') {
        const typeLower = type.toLowerCase();
        if (typeLower === 'percentage') {
            query.discountType = 'percentage';
        } else if (typeLower === 'flat' || typeLower === 'fixed amount') {
            query.discountType = 'flat';
        }
    }

    const [coupons, totalCount] = await Promise.all([
        Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Coupon.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        coupons,
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum
    };
};

/**
 * Retrieves a coupon by ID.
 * 
 * @param {string} couponId - Coupon ObjectId
 * @returns {Promise<object>} Coupon document
 */
export const getCouponById = async (couponId) => {
    const coupon = await Coupon.findById(couponId).lean();
    if (!coupon) {
        throw new Error('Coupon not found.');
    }
    return coupon;
};

/**
 * Updates an existing coupon.
 * 
 * @param {string} couponId - Coupon ObjectId
 * @param {object} data - Form update data
 * @returns {Promise<object>} Updated coupon
 */
export const updateCoupon = async (couponId, data) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error('Coupon not found.');
    }

    const {
        code,
        description,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        expiryDate,
        totalUsageLimit,
        userUsageLimit,
        isActive
    } = data;

    if (!code || !code.trim()) {
        throw new Error('Coupon code is required.');
    }

    const formattedCode = code.trim().toUpperCase();
    if (formattedCode !== coupon.code) {
        const existing = await Coupon.findOne({ code: formattedCode });
        if (existing) {
            throw new Error(`Coupon code "${formattedCode}" is already in use by another coupon.`);
        }
        coupon.code = formattedCode;
    }

    if (!discountType || !['percentage', 'flat'].includes(discountType)) {
        throw new Error('Valid discount type is required.');
    }

    const numericDiscount = parseFloat(discountValue);
    if (isNaN(numericDiscount) || numericDiscount <= 0) {
        throw new Error('Discount value must be greater than zero.');
    }

    if (discountType === 'percentage' && numericDiscount > 100) {
        throw new Error('Percentage discount cannot exceed 100%.');
    }

    if (!expiryDate) {
        throw new Error('Expiry date is required.');
    }

    let parsedExpiry;
    if (typeof expiryDate === 'string' && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(expiryDate.trim())) {
        const [day, month, year] = expiryDate.trim().split(/[/-]/);
        parsedExpiry = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 23, 59, 59);
    } else {
        parsedExpiry = new Date(expiryDate);
    }

    if (isNaN(parsedExpiry.getTime())) {
        throw new Error('Invalid expiry date provided. Please use DD/MM/YYYY format.');
    }

    coupon.description = description ? description.trim() : '';
    coupon.discountType = discountType;
    coupon.discountValue = discountType === 'flat' ? Math.round(numericDiscount * 100) : numericDiscount;
    coupon.minOrderAmount = minOrderAmount && parseFloat(minOrderAmount) > 0 ? Math.round(parseFloat(minOrderAmount) * 100) : 0;
    coupon.maxDiscountAmount = maxDiscountAmount && parseFloat(maxDiscountAmount) > 0 ? Math.round(parseFloat(maxDiscountAmount) * 100) : null;
    coupon.expiryDate = parsedExpiry;
    coupon.totalUsageLimit = totalUsageLimit && parseInt(totalUsageLimit, 10) > 0 ? parseInt(totalUsageLimit, 10) : null;
    coupon.userUsageLimit = userUsageLimit && parseInt(userUsageLimit, 10) > 0 ? parseInt(userUsageLimit, 10) : 1;

    if (typeof isActive !== 'undefined') {
        coupon.isActive = isActive === true || isActive === 'true' || isActive === 'on';
    }

    await coupon.save();
    return coupon;
};

/**
 * Toggles a coupon's active state.
 * 
 * @param {string} couponId - Coupon ObjectId
 * @returns {Promise<object>} Updated coupon
 */
export const toggleCouponStatus = async (couponId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error('Coupon not found.');
    }
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return coupon;
};

/**
 * Deletes a coupon by ID.
 * 
 * @param {string} couponId - Coupon ObjectId
 * @returns {Promise<boolean>} Success boolean
 */
export const deleteCoupon = async (couponId) => {
    const result = await Coupon.findByIdAndDelete(couponId);
    if (!result) {
        throw new Error('Coupon not found.');
    }
    return true;
};

/**
 * Validates a coupon code for a user's cart checkout.
 * 
 * @param {string} code - Coupon code entered
 * @param {string} userId - User ObjectId
 * @param {number} orderSubtotalPaisa - Order subtotal in integer paisa
 * @returns {Promise<object>} Validated coupon & discount amount in paisa
 */
export const validateCoupon = async (code, userId, orderSubtotalPaisa) => {
    if (!code || !code.trim()) {
        throw new Error('Please enter a coupon code.');
    }

    const formattedCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: formattedCode });

    if (!coupon) {
        throw new Error('Invalid coupon code.');
    }

    if (!coupon.isActive) {
        throw new Error('This coupon is currently inactive.');
    }

    if (new Date(coupon.expiryDate) <= new Date()) {
        throw new Error('This coupon has expired.');
    }

    if (coupon.totalUsageLimit !== null && coupon.totalRedemptions >= coupon.totalUsageLimit) {
        throw new Error('This coupon has reached its maximum global usage limit.');
    }

    if (orderSubtotalPaisa < coupon.minOrderAmount) {
        throw new Error(`Minimum order amount of ₹${(coupon.minOrderAmount / 100).toFixed(2)} required for this coupon.`);
    }

    if (userId) {
        const userUsage = coupon.usersUsed.find(u => u.userId.toString() === userId.toString());
        if (userUsage && userUsage.usedCount >= coupon.userUsageLimit) {
            throw new Error(`You have reached the maximum allowed uses (${coupon.userUsageLimit}) for this coupon.`);
        }
    }

    // Calculate discount amount in paisa
    let discountAmountPaisa = 0;
    if (coupon.discountType === 'percentage') {
        discountAmountPaisa = Math.round((orderSubtotalPaisa * coupon.discountValue) / 100);
        if (coupon.maxDiscountAmount !== null && discountAmountPaisa > coupon.maxDiscountAmount) {
            discountAmountPaisa = coupon.maxDiscountAmount;
        }
    } else if (coupon.discountType === 'flat') {
        discountAmountPaisa = Math.min(coupon.discountValue, orderSubtotalPaisa);
    }

    return {
        coupon,
        discountAmountPaisa
    };
};

/**
 * Records redemption usage for a coupon after a successful checkout.
 * 
 * @param {string} couponId - Coupon ObjectId
 * @param {string} userId - User ObjectId
 */
export const recordCouponUsage = async (couponId, userId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) return;

    coupon.totalRedemptions += 1;

    if (userId) {
        const userUsage = coupon.usersUsed.find(u => u.userId.toString() === userId.toString());
        if (userUsage) {
            userUsage.usedCount += 1;
            userUsage.lastUsedAt = new Date();
        } else {
            coupon.usersUsed.push({
                userId,
                usedCount: 1,
                lastUsedAt: new Date()
            });
        }
    }

    await coupon.save();
};
