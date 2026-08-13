import Category from '../../models/Category.js';

export const getAllActiveCategories = async () => {
    try {
        return await Category.find({ status: 'Live' }).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[categoryHelper.getAllActiveCategories] Error:', error);
        throw error;
    }
};

export const getAllCategories = async () => {
    try {
        return await Category.find({}).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[categoryHelper.getAllCategories] Error:', error);
        throw error;
    }
};
