import Category from '../models/Category.js';
import Product from '../models/Product.js';

export const getAllActiveCategories = async () => {
    try {
        return await Category.find({ status: { $ne: 'Hidden' } }).lean();
    } catch (error) {
        console.error('[categoryService.getAllActiveCategories] Error:', error);
        throw error;
    }
};

export const getAllCategoriesAdmin = async (search = '', page = 1, limit = 8) => {
    try {
        const query = {};
        if (search && search.trim()) {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }
        const totalCount = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = Math.max(1, Math.min(page, totalPages || 1));

        const categoriesRaw = await Category.find(query)
            .skip((currentPage - 1) * limit)
            .limit(limit)
            .lean();
        
        const categories = await Promise.all(categoriesRaw.map(async (cat) => {
            const gameCount = await Product.countDocuments({ category: cat._id });
            return {
                ...cat,
                gameCount,
                defaultOffer: cat.defaultOffer || 0,
                status: cat.status || 'Live'
            };
        }));
        
        return {
            categories,
            currentPage,
            totalPages,
            totalCount
        };
    } catch (error) {
        console.error('[categoryService.getAllCategoriesAdmin] Error:', error);
        throw error;
    }
};

export const getAllCategories = async () => {
    try {
        return await Category.find({}).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[categoryService.getAllCategories] Error:', error);
        throw error;
    }
};
