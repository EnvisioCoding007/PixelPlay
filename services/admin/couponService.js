import Coupon from '../../models/Coupon.js';

/**
 * Formats a Date object into 'dd/mm/yyyy hh:mm AM/PM' using local time.
 */
export const formatDDMMYYYY = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${day}/${month}/${year} ${pad(hours)}:${minutes} ${ampm}`;
};

/**
 * Formats a Date object into 'YYYY-MM-DDTHH:mm' string for HTML <input type="datetime-local"> using local time.
 */
export const formatLocalDatetimeInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Creates a new coupon with input validation and currency normalization into Paisa.
 * 
 * @param {Object} data 
 * @param {string} data.code
 * @param {'percentage'|'flat'} data.discountType
 * @param {number} data.discountValue - Percentage (e.g. 20) or Flat Rupees
 * @param {number} [data.minOrderAmountRupees=0]
 * @param {number} [data.maxDiscountAmountRupees=null]
 * @param {Date} [data.startDate]
 * @param {Date} data.expiryDate
 * @param {number} [data.usageLimit=null]
 * @param {number} [data.perUserLimit=1]
 * @param {string} [data.description='']
 */
export const createCoupon = async (data) => {
    const {
        code,
        discountType,
        discountValue,
        minOrderAmountRupees = 0,
        maxDiscountAmountRupees = null,
        startDate,
        expiryDate,
        usageLimit = null,
        perUserLimit = 1,
        description = ''
    } = data;

    if (!code || !code.trim()) {
        throw new Error('Coupon code is required');
    }

    const normalizedCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) {
        throw new Error(`Coupon code '${normalizedCode}' already exists`);
    }

    if (!['percentage', 'flat'].includes(discountType)) {
        throw new Error('Discount type must be either percentage or flat');
    }

    const numValue = Number(discountValue);
    if (isNaN(numValue) || numValue <= 0) {
        throw new Error('Discount value must be greater than 0');
    }

    if (discountType === 'percentage' && numValue > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
    }

    if (!expiryDate) {
        throw new Error('Expiry date is required');
    }

    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
        throw new Error('Invalid expiry date');
    }

    const start = startDate ? new Date(startDate) : new Date();
    if (expiry <= start) {
        throw new Error('Expiry date must be after the start date');
    }

    // Convert rupee inputs to Paisa integers
    const minOrderAmountPaisa = Math.max(0, Math.round((Number(minOrderAmountRupees) || 0) * 100));
    const maxDiscountPaisa = maxDiscountAmountRupees !== null && maxDiscountAmountRupees !== undefined && maxDiscountAmountRupees !== ''
        ? Math.max(0, Math.round(Number(maxDiscountAmountRupees) * 100))
        : null;

    const discountValueStored = discountType === 'flat' 
        ? Math.round(numValue * 100) 
        : numValue;

    const newCoupon = new Coupon({
        code: normalizedCode,
        discountType,
        discountValue: discountValueStored,
        minOrderAmount: minOrderAmountPaisa,
        maxDiscountAmount: maxDiscountPaisa,
        startDate: start,
        expiryDate: expiry,
        usageLimit: usageLimit ? Math.max(1, parseInt(usageLimit, 10)) : null,
        perUserLimit: perUserLimit ? Math.max(1, parseInt(perUserLimit, 10)) : 1,
        description: description ? description.trim() : '',
        isActive: true
    });

    await newCoupon.save();
    return newCoupon;
};

/**
 * Retrieves paginated list of coupons for admin management along with summary metrics.
 * 
 * @param {string} search 
 * @param {number} page 
 * @param {number} limit 
 * @param {string} statusFilter - 'all', 'active', 'inactive', 'expired'
 */
export const getAdminCoupons = async (search = '', page = 1, limit = 10, statusFilter = 'all') => {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (search && search.trim()) {
        const searchStr = search.trim();
        filter.$or = [
            { code: { $regex: searchStr, $options: 'i' } },
            { description: { $regex: searchStr, $options: 'i' } }
        ];
    }

    const now = new Date();
    if (statusFilter === 'active') {
        filter.isActive = true;
        filter.expiryDate = { $gte: now };
    } else if (statusFilter === 'inactive') {
        filter.isActive = false;
    } else if (statusFilter === 'expired') {
        filter.expiryDate = { $lt: now };
    }

    const [
        coupons, 
        totalCount, 
        totalCouponsCount, 
        activeCouponsCount, 
        expiredCouponsCount,
        redemptionsAgg
    ] = await Promise.all([
        Coupon.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Coupon.countDocuments(filter),
        Coupon.countDocuments({}),
        Coupon.countDocuments({ isActive: true, expiryDate: { $gte: now } }),
        Coupon.countDocuments({ expiryDate: { $lt: now } }),
        Coupon.aggregate([
            { $group: { _id: null, totalRedemptions: { $sum: '$usedCount' } } }
        ])
    ]);

    const totalRedemptionsCount = redemptionsAgg.length > 0 ? redemptionsAgg[0].totalRedemptions : 0;

    const formattedCoupons = coupons.map(c => {
        const isExpired = new Date(c.expiryDate) < now;
        let discountDisplay;
        if (c.discountType === 'percentage') {
            discountDisplay = `${c.discountValue}%`;
            if (c.maxDiscountAmount) {
                discountDisplay += ` (Max ₹${(c.maxDiscountAmount / 100).toFixed(2)})`;
            }
        } else {
            discountDisplay = `₹${(c.discountValue / 100).toFixed(2)}`;
        }

        return {
            ...c,
            discountDisplay,
            discountValueRupees: c.discountType === 'flat' ? (c.discountValue / 100).toFixed(2) : c.discountValue,
            minOrderRupees: (c.minOrderAmount / 100).toFixed(2),
            maxDiscountRupees: c.maxDiscountAmount ? (c.maxDiscountAmount / 100).toFixed(2) : '',
            expiryDateDisplay: formatDDMMYYYY(c.expiryDate),
            startDateDisplay: formatDDMMYYYY(c.startDate),
            isExpired,
            statusLabel: !c.isActive ? 'Inactive' : (isExpired ? 'Expired' : 'Active')
        };
    });

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        coupons: formattedCoupons,
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        totalCouponsCount,
        activeCouponsCount,
        expiredCouponsCount,
        totalRedemptionsCount
    };
};

/**
 * Retrieves single coupon details by ID.
 * 
 * @param {string} couponId 
 */
export const getCouponById = async (couponId) => {
    const coupon = await Coupon.findById(couponId).lean();
    if (!coupon) {
        throw new Error('Coupon not found');
    }
    return {
        ...coupon,
        discountValueRupees: coupon.discountType === 'flat' ? (coupon.discountValue / 100).toFixed(2) : coupon.discountValue,
        minOrderRupees: (coupon.minOrderAmount / 100).toFixed(2),
        maxDiscountRupees: coupon.maxDiscountAmount ? (coupon.maxDiscountAmount / 100).toFixed(2) : '',
        startDateFormatted: formatLocalDatetimeInput(coupon.startDate),
        expiryDateFormatted: formatLocalDatetimeInput(coupon.expiryDate)
    };
};

/**
 * Updates an existing coupon.
 * 
 * @param {string} couponId 
 * @param {Object} updateData 
 */
export const updateCoupon = async (couponId, updateData) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error('Coupon not found');
    }

    if (updateData.code && updateData.code.trim().toUpperCase() !== coupon.code) {
        const newCode = updateData.code.trim().toUpperCase();
        const existing = await Coupon.findOne({ code: newCode, _id: { $ne: couponId } });
        if (existing) {
            throw new Error(`Coupon code '${newCode}' is already taken`);
        }
        coupon.code = newCode;
    }

    if (updateData.discountType) {
        if (!['percentage', 'flat'].includes(updateData.discountType)) {
            throw new Error('Invalid discount type');
        }
        coupon.discountType = updateData.discountType;
    }

    if (updateData.discountValue !== undefined) {
        const numVal = Number(updateData.discountValue);
        if (isNaN(numVal) || numVal <= 0) {
            throw new Error('Discount value must be greater than 0');
        }
        if (coupon.discountType === 'percentage' && numVal > 100) {
            throw new Error('Percentage discount cannot exceed 100%');
        }
        coupon.discountValue = coupon.discountType === 'flat' ? Math.round(numVal * 100) : numVal;
    }

    if (updateData.minOrderAmountRupees !== undefined) {
        coupon.minOrderAmount = Math.max(0, Math.round((Number(updateData.minOrderAmountRupees) || 0) * 100));
    }

    if (updateData.maxDiscountAmountRupees !== undefined) {
        coupon.maxDiscountAmount = updateData.maxDiscountAmountRupees !== '' && updateData.maxDiscountAmountRupees !== null
            ? Math.max(0, Math.round(Number(updateData.maxDiscountAmountRupees) * 100))
            : null;
    }

    if (updateData.expiryDate) {
        const exp = new Date(updateData.expiryDate);
        if (isNaN(exp.getTime())) {
            throw new Error('Invalid expiry date');
        }
        coupon.expiryDate = exp;
    }

    if (updateData.startDate) {
        const st = new Date(updateData.startDate);
        if (!isNaN(st.getTime())) {
            coupon.startDate = st;
        }
    }

    if (updateData.usageLimit !== undefined) {
        coupon.usageLimit = updateData.usageLimit ? Math.max(1, parseInt(updateData.usageLimit, 10)) : null;
    }

    if (updateData.perUserLimit !== undefined) {
        coupon.perUserLimit = updateData.perUserLimit ? Math.max(1, parseInt(updateData.perUserLimit, 10)) : 1;
    }

    if (updateData.description !== undefined) {
        coupon.description = updateData.description.trim();
    }

    if (updateData.isActive !== undefined) {
        coupon.isActive = Boolean(updateData.isActive);
    }

    await coupon.save();
    return coupon;
};

/**
 * Toggles coupon active status (active <-> inactive).
 * 
 * @param {string} couponId 
 */
export const toggleCouponStatus = async (couponId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error('Coupon not found');
    }
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return coupon;
};

/**
 * Deletes a coupon.
 * 
 * @param {string} couponId 
 */
export const deleteCoupon = async (couponId) => {
    const deleted = await Coupon.findByIdAndDelete(couponId);
    if (!deleted) {
        throw new Error('Coupon not found');
    }
    return deleted;
};
