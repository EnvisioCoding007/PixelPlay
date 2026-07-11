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
            .sort({ createdAt: -1 })
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

export const createCategory = async ({ name, defaultOffer, description, icon }) => {
    try {
        if (!name || !name.trim()) {
            throw new Error('Category name is required.');
        }

        if (name.trim().length > 50) {
            throw new Error('Category name cannot exceed 50 characters.');
        }

        if (description && description.trim().length > 500) {
            throw new Error('Category description cannot exceed 500 characters.');
        }

        const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
        if (existing) {
            throw new Error('Category already exists.');
        }

        let parsedOffer = 0;
        if (defaultOffer) {
            const cleaned = String(defaultOffer).replace(/[^\d.]/g, '');
            parsedOffer = parseFloat(cleaned) || 0;
        }

        if (parsedOffer < 0 || parsedOffer > 100) {
            throw new Error('Category offer/discount must be between 0 and 100 percent.');
        }

        return await Category.create({ 
            name: name.trim(),
            defaultOffer: parsedOffer,
            description: description?.trim() || '',
            icon: icon || ''
        });
    } catch (error) {
        console.error('[categoryService.createCategory] Error:', error);
        throw error;
    }
};

export const toggleCategoryStatus = async (id) => {
    try {
        const category = await Category.findById(id);
        if (!category) {
            throw new Error('Category not found.');
        }

        const currentStatus = category.status || 'Live';
        const newStatus = currentStatus === 'Live' ? 'Hidden' : 'Live';

        if (newStatus === 'Hidden') {
            await Product.updateMany({ category: id }, { status: 'Hidden' });
        }

        category.status = newStatus;
        await category.save();

        return {
            status: newStatus,
            message: `Category has been ${newStatus === 'Live' ? 'listed' : 'unlisted'}.`
        };
    } catch (error) {
        console.error('[categoryService.toggleCategoryStatus] Error:', error);
        throw error;
    }
};

export const getCategoryDetailsAdmin = async (id) => {
    try {
        const category = await Category.findById(id).lean();
        if (!category) {
            return null;
        }

        const linkedGamesCount = await Product.countDocuments({ category: id });
        return {
            category,
            linkedGamesCount
        };
    } catch (error) {
        console.error('[categoryService.getCategoryDetailsAdmin] Error:', error);
        throw error;
    }
};

export const updateCategory = async (id, { name, defaultOffer, description, status, icon }) => {
    try {
        if (!name || !name.trim()) {
            throw new Error('Category name is required.');
        }

        if (name.trim().length > 50) {
            throw new Error('Category name cannot exceed 50 characters.');
        }

        if (description && description.trim().length > 500) {
            throw new Error('Category description cannot exceed 500 characters.');
        }

        const category = await Category.findById(id);
        if (!category) {
            throw new Error('Category not found.');
        }

        if (status === 'Hidden') {
            await Product.updateMany({ category: id }, { status: 'Hidden' });
        }

        const conflict = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, 
            _id: { $ne: id } 
        });
        if (conflict) {
            throw new Error('Category name already exists.');
        }

        let parsedOffer = 0;
        if (defaultOffer) {
            const cleaned = String(defaultOffer).replace(/[^\d.]/g, '');
            parsedOffer = parseFloat(cleaned) || 0;
        }

        if (parsedOffer < 0 || parsedOffer > 100) {
            throw new Error('Category offer/discount must be between 0 and 100 percent.');
        }

        category.name = name.trim();
        category.defaultOffer = parsedOffer;
        category.description = description?.trim() || '';
        if (status !== undefined) {
            category.status = status || category.status || 'Live';
        }
        if (icon !== undefined) {
            category.icon = icon;
        }

        return await category.save();
    } catch (error) {
        console.error('[categoryService.updateCategory] Error:', error);
        throw error;
    }
};

export const deleteCategory = async (id) => {
    try {
        const linkedGamesCount = await Product.countDocuments({ category: id });
        if (linkedGamesCount > 0) {
            throw new Error('Deletion blocked: change the category of associated games first.');
        }

        const deleted = await Category.findByIdAndDelete(id);
        if (!deleted) {
            throw new Error('Category not found.');
        }

        return deleted;
    } catch (error) {
        console.error('[categoryService.deleteCategory] Error:', error);
        throw error;
    }
};

