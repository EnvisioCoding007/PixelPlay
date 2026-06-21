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

export const getAllCategoriesAdmin = async (search = '') => {
    try {
        const query = {};
        if (search && search.trim()) {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }
        const categoriesRaw = await Category.find(query).lean();
        
        const categories = await Promise.all(categoriesRaw.map(async (cat) => {
            const gameCount = await Product.countDocuments({ category: cat._id });
            return {
                ...cat,
                gameCount,
                defaultOffer: cat.defaultOffer || 0,
                status: cat.status || 'Live'
            };
        }));
        
        return categories;
    } catch (error) {
        console.error('[categoryService.getAllCategoriesAdmin] Error:', error);
        throw error;
    }
};
