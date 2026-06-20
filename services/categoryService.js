import Category from '../models/Category.js';

export const getAllActiveCategories = async () => {
    try {
        return await Category.find({ status: { $ne: 'Hidden' } }).lean();
    } catch (error) {
        console.error('[categoryService.getAllActiveCategories] Error:', error);
        throw error;
    }
};
