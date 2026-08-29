import Offer from '../../models/Offer.js';
import Category from '../../models/Category.js';
import Product from '../../models/Product.js';
import Publisher from '../../models/Publisher.js';

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
 * Retrieves dropdown choices for categories, products, and publishers to select offer targets.
 */
export const getOfferTargetOptions = async () => {
    try {
        const [categories, rawProducts, savedPublishers, distinctProductPubs] = await Promise.all([
            Category.find({ status: 'Live' }).select('name').sort({ name: 1 }).lean(),
            Product.find({ status: 'Live' }).select('title cover_image price').sort({ title: 1 }).lean(),
            Publisher.find({ is_listed: { $ne: false } }).select('name').sort({ name: 1 }).lean(),
            Product.distinct('publisher')
        ]);

        const publisherSet = new Set();
        savedPublishers.forEach(p => {
            if (p.name) publisherSet.add(p.name);
        });
        distinctProductPubs.forEach(pubName => {
            if (pubName) publisherSet.add(pubName);
        });

        const publishers = Array.from(publisherSet).sort().map(name => ({ name }));

        return {
            categories,
            products: rawProducts.map(p => ({
                _id: p._id.toString(),
                title: p.title,
                cover_image: p.cover_image
            })),
            publishers
        };
    } catch (error) {
        console.error('[offerService.getOfferTargetOptions] Error:', error);
        throw error;
    }
};

/**
 * Retrieves paginated list of offers for admin management along with summary metrics.
 */
export const getAdminOffers = async (search = '', targetTypeFilter = 'all', statusFilter = 'all', page = 1, limit = 10) => {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (search && search.trim()) {
        const searchStr = search.trim();
        filter.$or = [
            { title: { $regex: searchStr, $options: 'i' } },
            { description: { $regex: searchStr, $options: 'i' } },
            { targetPublisher: { $regex: searchStr, $options: 'i' } }
        ];
    }

    if (targetTypeFilter && targetTypeFilter !== 'all') {
        filter.targetType = targetTypeFilter;
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
        offers,
        totalCount,
        totalOffersCount,
        activeOffersCount,
        expiredOffersCount
    ] = await Promise.all([
        Offer.find(filter)
            .populate('targetCategory', 'name')
            .populate('targetProduct', 'title cover_image')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Offer.countDocuments(filter),
        Offer.countDocuments({}),
        Offer.countDocuments({ isActive: true, expiryDate: { $gte: now } }),
        Offer.countDocuments({ expiryDate: { $lt: now } })
    ]);

    const formattedOffers = offers.map(o => {
        const isExpired = new Date(o.expiryDate) < now;
        let discountDisplay = '';
        if (o.discountType === 'percentage') {
            discountDisplay = `${o.discountValue}% OFF`;
        } else {
            discountDisplay = `₹${(o.discountValue / 100).toFixed(2)} OFF`;
        }

        let targetName = 'N/A';
        if (o.targetType === 'Category' && o.targetCategory) {
            targetName = o.targetCategory.name;
        } else if (o.targetType === 'Product' && o.targetProduct) {
            targetName = o.targetProduct.title;
        } else if (o.targetType === 'Publisher' && o.targetPublisher) {
            targetName = o.targetPublisher;
        }

        return {
            ...o,
            targetName,
            discountDisplay,
            discountValueRupees: o.discountType === 'flat' ? (o.discountValue / 100).toFixed(2) : o.discountValue,
            expiryDateDisplay: formatDDMMYYYY(o.expiryDate),
            startDateDisplay: formatDDMMYYYY(o.startDate),
            isExpired,
            statusLabel: !o.isActive ? 'Inactive' : (isExpired ? 'Expired' : 'Active')
        };
    });

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        offers: formattedOffers,
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        totalOffersCount,
        activeOffersCount,
        expiredOffersCount
    };
};

/**
 * Retrieves single offer details by ID.
 */
export const getOfferById = async (offerId) => {
    const offer = await Offer.findById(offerId)
        .populate('targetCategory', 'name')
        .populate('targetProduct', 'title')
        .lean();
    if (!offer) {
        throw new Error('Offer not found');
    }

    return {
        ...offer,
        discountValueRupees: offer.discountType === 'flat' ? (offer.discountValue / 100).toFixed(2) : offer.discountValue,
        startDateFormatted: formatLocalDatetimeInput(offer.startDate),
        expiryDateFormatted: formatLocalDatetimeInput(offer.expiryDate)
    };
};

/**
 * Validates offer input data and creates a new offer.
 */
export const createOffer = async (data) => {
    const {
        title,
        targetType,
        targetCategory,
        targetProduct,
        targetPublisher,
        discountType = 'percentage',
        discountValue,
        startDate,
        expiryDate,
        description = ''
    } = data;

    if (!title || !title.trim()) {
        throw new Error('Offer title is required');
    }

    if (!['Category', 'Product', 'Publisher'].includes(targetType)) {
        throw new Error('Target type must be Category, Product, or Publisher');
    }

    let finalCategory = null;
    let finalProduct = null;
    let finalPublisher = null;

    if (targetType === 'Category') {
        if (!targetCategory) throw new Error('Target category is required');
        const catExists = await Category.findById(targetCategory);
        if (!catExists) throw new Error('Selected category does not exist');
        finalCategory = targetCategory;
    } else if (targetType === 'Product') {
        if (!targetProduct) throw new Error('Target product/game is required');
        const prodExists = await Product.findById(targetProduct);
        if (!prodExists) throw new Error('Selected product does not exist');
        finalProduct = targetProduct;
    } else if (targetType === 'Publisher') {
        if (!targetPublisher || !targetPublisher.trim()) throw new Error('Target publisher name is required');
        finalPublisher = targetPublisher.trim();
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

    const discountValueStored = discountType === 'flat'
        ? Math.round(numValue * 100)
        : numValue;

    const newOffer = new Offer({
        title: title.trim(),
        targetType,
        targetCategory: finalCategory,
        targetProduct: finalProduct,
        targetPublisher: finalPublisher,
        discountType,
        discountValue: discountValueStored,
        startDate: start,
        expiryDate: expiry,
        description: description ? description.trim() : '',
        isActive: true
    });

    await newOffer.save();
    
    const { checkAndNotifyOffer } = await import('../shared/notificationHelper.js');
    checkAndNotifyOffer(newOffer).catch(err => console.error('[createOffer Notification Error]', err));

    return newOffer;
};

/**
 * Updates an existing offer.
 */
export const updateOffer = async (offerId, updateData) => {
    const offer = await Offer.findById(offerId);
    if (!offer) {
        throw new Error('Offer not found');
    }

    if (updateData.title) {
        if (!updateData.title.trim()) throw new Error('Offer title cannot be empty');
        offer.title = updateData.title.trim();
    }

    if (updateData.targetType) {
        if (!['Category', 'Product', 'Publisher'].includes(updateData.targetType)) {
            throw new Error('Invalid target type');
        }
        offer.targetType = updateData.targetType;
    }

    if (offer.targetType === 'Category') {
        const catId = updateData.targetCategory || offer.targetCategory;
        if (!catId) throw new Error('Target category is required');
        const catExists = await Category.findById(catId);
        if (!catExists) throw new Error('Selected category does not exist');
        offer.targetCategory = catId;
        offer.targetProduct = null;
        offer.targetPublisher = null;
    } else if (offer.targetType === 'Product') {
        const prodId = updateData.targetProduct || offer.targetProduct;
        if (!prodId) throw new Error('Target product/game is required');
        const prodExists = await Product.findById(prodId);
        if (!prodExists) throw new Error('Selected product does not exist');
        offer.targetProduct = prodId;
        offer.targetCategory = null;
        offer.targetPublisher = null;
    } else if (offer.targetType === 'Publisher') {
        const pubName = updateData.targetPublisher || offer.targetPublisher;
        if (!pubName || !pubName.trim()) throw new Error('Target publisher name is required');
        offer.targetPublisher = pubName.trim();
        offer.targetCategory = null;
        offer.targetProduct = null;
    }

    if (updateData.discountType) {
        if (!['percentage', 'flat'].includes(updateData.discountType)) {
            throw new Error('Invalid discount type');
        }
        offer.discountType = updateData.discountType;
    }

    if (updateData.discountValue !== undefined) {
        const numVal = Number(updateData.discountValue);
        if (isNaN(numVal) || numVal <= 0) {
            throw new Error('Discount value must be greater than 0');
        }
        if (offer.discountType === 'percentage' && numVal > 100) {
            throw new Error('Percentage discount cannot exceed 100%');
        }
        offer.discountValue = offer.discountType === 'flat' ? Math.round(numVal * 100) : numVal;
    }

    if (updateData.expiryDate) {
        const exp = new Date(updateData.expiryDate);
        if (isNaN(exp.getTime())) {
            throw new Error('Invalid expiry date');
        }
        offer.expiryDate = exp;
    }

    if (updateData.startDate) {
        const st = new Date(updateData.startDate);
        if (!isNaN(st.getTime())) {
            offer.startDate = st;
        }
    }

    if (updateData.description !== undefined) {
        offer.description = updateData.description.trim();
    }

    if (updateData.isActive !== undefined) {
        offer.isActive = Boolean(updateData.isActive);
    }

    await offer.save();

    if (offer.isActive) {
        const { checkAndNotifyOffer } = await import('../shared/notificationHelper.js');
        checkAndNotifyOffer(offer).catch(err => console.error('[updateOffer Notification Error]', err));
    }

    return offer;
};

/**
 * Toggles an offer's active status.
 */
export const toggleOfferStatus = async (offerId) => {
    const offer = await Offer.findById(offerId);
    if (!offer) {
        throw new Error('Offer not found');
    }
    offer.isActive = !offer.isActive;
    await offer.save();

    if (offer.isActive) {
        const { checkAndNotifyOffer } = await import('../shared/notificationHelper.js');
        checkAndNotifyOffer(offer).catch(err => console.error('[toggleOfferStatus Notification Error]', err));
    }

    return offer;
};

/**
 * Deletes an offer.
 */
export const deleteOffer = async (offerId) => {
    const deleted = await Offer.findByIdAndDelete(offerId);
    if (!deleted) {
        throw new Error('Offer not found');
    }
    return deleted;
};
