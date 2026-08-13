import * as categoryService from '../../services/categoryService.js';
import { uploadToCloudinary } from '../../config/cloudinary.js';

export const renderCategoryManagement = async (req, res) => {
    try {
        const { search = '', sort = 'latest', page = 1, error, success } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = 8;

        const { categories, currentPage, totalPages, totalCount } = await categoryService.getAllCategoriesAdmin(search, sort, pageNum, limitNum);

        res.render('admin/listed-categories', {
            categories,
            currentPage,
            totalPages,
            totalCount,
            limit: limitNum,
            search,
            sort,
            error: error || null,
            success: success || null,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderCategoryManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderAddCategory = (req, res) => {
    try {
        const { error, success } = req.query;
        res.render('admin/add-category', {
            error: error || null,
            success: success || null,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAddCategory]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const createCategory = async (req, res) => {
    try {
        const { name, defaultOffer, description } = req.body;

        let iconUrl = '';
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            iconUrl = uploadResult.secure_url;
        }

        await categoryService.createCategory({ 
            name,
            defaultOffer,
            description,
            icon: iconUrl
        });
        res.redirect('/admin/categories?success=Category added successfully.');
    } catch (err) {
        console.error('[createCategory]', err);
        res.redirect(`/admin/categories/add?error=${encodeURIComponent(err.message || 'Internal Server Error')}`);
    }
};

export const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await categoryService.toggleCategoryStatus(id);

        return res.status(200).json({
            success: true,
            status: result.status,
            message: result.message
        });
    } catch (err) {
        console.error('[toggleCategoryStatus]', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal Server Error.' });
    }
};

export const renderEditCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await categoryService.getCategoryDetailsAdmin(id);
        if (!details) {
            return res.status(404).send('Category not found');
        }

        res.render('admin/edit-category', {
            category: details.category,
            linkedGamesCount: details.linkedGamesCount,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditCategory]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const editCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, defaultOffer, description, status } = req.body;

        let iconUrl = undefined;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            iconUrl = uploadResult.secure_url;
        }

        await categoryService.updateCategory(id, {
            name,
            defaultOffer,
            description,
            status,
            icon: iconUrl
        });
        res.redirect('/admin/categories?success=Category updated successfully.');
    } catch (err) {
        console.error('[editCategory]', err);
        res.status(500).send(err.message || 'Internal Server Error');
    }
};

export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await categoryService.deleteCategory(id);

        return res.status(200).json({ success: true, message: 'Category deleted successfully.' });
    } catch (err) {
        console.error('[deleteCategory]', err);
        return res.status(400).json({ success: false, message: err.message || 'Internal Server Error.' });
    }
};
