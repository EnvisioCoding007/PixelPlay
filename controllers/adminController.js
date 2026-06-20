import User from '../models/User.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Publisher from '../models/Publisher.js';
import bcrypt from 'bcrypt';
import * as productService from '../services/productService.js';
import * as categoryService from '../services/categoryService.js';
import { uploadToCloudinary } from '../config/cloudinary.js';


export const getAdminLogin = (req, res) => {
    res.render('admin/login', { error: null });
};


export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin/login', { error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            return res.render('admin/login', { error: 'Invalid credentials.' });
        }

        if (user.role !== 'admin') {
            return res.render('admin/login', { error: 'Access denied. Admins only.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.render('admin/login', { error: 'Invalid credentials.' });
        }

        // Regenerate the session ID first (prevents session-fixation attacks),
        // then explicitly save before redirecting so the MemoryStore write is
        // committed before the browser follows the 302 to /admin/users.
        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error('[adminLogin] session.regenerate error:', regenErr);
                return res.render('admin/login', { error: 'Session error. Please try again.' });
            }

            req.session.admin = { _id: user._id, role: 'admin' };

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('[adminLogin] session.save error:', saveErr);
                    return res.render('admin/login', { error: 'Session error. Please try again.' });
                }
                return res.redirect('/admin/users');
            });
        });
    } catch (err) {
        console.error('[adminLogin]', err);
        return res.render('admin/login', { error: 'An unexpected error occurred. Please try again.' });
    }
};


export const getCustomers = async (req, res) => {
    try {
        const { page = 1, search = '', limit = 10, status = '', tier = '', sort = '-createdAt' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        // Build dynamic search filter across username and email fields
        const queryFilter = search
            ? {
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        // Exclude admin accounts from the customer table
        const filter = { ...queryFilter, role: 'user' };

        // Apply status filter
        if (status === 'active') {
            filter.is_blocked = false;
        } else if (status === 'suspended') {
            filter.is_blocked = true;
        }

        // Sort configuration
        let sortConfig = { createdAt: -1 };
        if (sort === '-createdAt') {
            sortConfig = { createdAt: -1 };
        } else if (sort === 'createdAt') {
            sortConfig = { createdAt: 1 };
        } else if (sort === 'name_asc') {
            sortConfig = { username: 1 };
        } else if (sort === 'name_desc') {
            sortConfig = { username: -1 };
        }

        const [users, totalCount] = await Promise.all([
            User.find(filter)
                .sort(sortConfig)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            User.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalCount / limitNum);

        // Build currentFilters object for Clear button
        const currentFilters = {};
        if (search) currentFilters.search = search;
        if (status) currentFilters.status = status;
        if (tier) currentFilters.tier = tier;
        if (sort && sort !== '-createdAt') currentFilters.sort = sort;

        res.render('admin/customer-management', {
            users,
            currentPage: pageNum,
            totalPages,
            totalCount,
            search,
            status,
            tier,
            sort,
            currentSearch: search,
            currentStatus: status,
            currentSort: sort,
            currentFilters,
            limit: limitNum,
        });
    } catch (err) {
        console.error('[getCustomers]', err);
        res.status(500).send('Internal Server Error');
    }
};

// Toggle Block / Unblock User

export const toggleBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user || user.role === 'admin') {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        user.is_blocked = !user.is_blocked;
        await user.save();

        return res.status(200).json({
            success: true,
            is_blocked: user.is_blocked,
            message: user.is_blocked
                ? 'User has been suspended.'
                : 'User has been reinstated.',
        });
    } catch (err) {
        console.error('[toggleBlock]', err);
        return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
    }
};


export const adminLogout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};


export const renderProductManagement = async (req, res) => {
    try {
        const { search = '', category = 'All', type = 'All', sort = 'A-Z', page = 1, platform = 'All', developer = 'All', status = 'All' } = req.query;
        const limit = 10;

        const result = await productService.getAllAdminProducts(
            search,
            { category, type, platform, developer, status },
            sort,
            parseInt(page, 10),
            limit
        );

        const activeCategories = await categoryService.getAllActiveCategories();
        const dbCategoryNames = activeCategories.map(c => c.name);

        res.render('admin/listed-games', {
            products: result.products,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            limit: result.limit,
            search,
            category,
            type,
            sort,
            platform,
            developer,
            status,
            dbCategoryNames,
            dbPlatforms: result.dbPlatforms,
            dbPublishers: result.dbPublishers,
            user: req.session.admin || req.session.user || null
        });
    } catch (err) {
        console.error('[renderProductManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderEditGamePage = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await productService.getProductById(id);
        if (!product) {
            return res.status(404).send('Product not found');
        }
        const categories = await categoryService.getAllActiveCategories();
        const publishers = await Publisher.find({}).sort({ name: 1 }).lean();
        res.render('admin/edit-game', {
            product,
            categories,
            publishers,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditGamePage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            publisher,
            release_year,
            price,
            stock,
            category,
            edition_type,
            description,
            status
        } = req.body;

        const platformsRaw = req.body['platforms[]'] || req.body.platforms || [];
        const platforms = Array.isArray(platformsRaw) ? platformsRaw : [platformsRaw];

        const platform_stock = [];
        let calculatedTotalStock = 0;
        platforms.forEach(platform => {
            const stockKey = `platform_stock_${platform}`;
            const pStock = Number(req.body[stockKey]) || 0;
            platform_stock.push({ platform, stock: pStock });
            calculatedTotalStock += pStock;
        });

        const fallbackValue = (val, defaultValue) => {
            if (val === undefined || val === null || String(val).trim() === '') {
                return defaultValue;
            }
            return String(val).trim();
        };

        const system_requirements = {
            minimum: {
                architecture: fallbackValue(req.body['system_requirements.minimum.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.minimum.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.minimum.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.minimum.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.minimum.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.minimum.storage'], 'N/A'),
                sound_card: req.body['system_requirements.minimum.sound_card'] || null,
                additional_notes: req.body['system_requirements.minimum.additional_notes'] || null
            },
            recommended: {
                architecture: fallbackValue(req.body['system_requirements.recommended.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.recommended.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.recommended.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.recommended.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.recommended.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.recommended.storage'], 'N/A'),
                sound_card: req.body['system_requirements.recommended.sound_card'] || null,
                additional_notes: req.body['system_requirements.recommended.additional_notes'] || null
            }
        };

        const existingProduct = await productService.getProductById(id);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: 'Game not found.' });
        }

        // Handle Cover Image
        let cover_image = existingProduct.cover_image;
        const coverFiles = req.files && req.files.cover_image ? req.files.cover_image : [];
        if (coverFiles.length > 0) {
            const coverUploadResult = await uploadToCloudinary(coverFiles[0], 'pixelplay_uploads');
            cover_image = coverUploadResult.secure_url;
        }

        // Handle Gallery
        const existingGalleryRaw = req.body.existing_gallery || req.body['existing_gallery[]'] || [];
        const existingGallery = Array.isArray(existingGalleryRaw) ? existingGalleryRaw : [existingGalleryRaw];

        const galleryFiles = req.files && req.files.gallery ? req.files.gallery : [];
        const newGalleryUploadPromises = galleryFiles.map(file => uploadToCloudinary(file, 'pixelplay_uploads'));
        const newGalleryUploadResults = await Promise.all(newGalleryUploadPromises);
        const newGalleryUrls = newGalleryUploadResults.map(res => res.secure_url);

        const gallery = [...existingGallery.filter(url => url && url.trim() !== ''), ...newGalleryUrls];

        const updatedProduct = await productService.updateProduct(id, {
            title,
            publisher,
            release_year: Number(release_year),
            price: Number(price),
            stock: calculatedTotalStock,
            platform_stock,
            category,
            platforms,
            edition_type,
            description,
            cover_image,
            gallery,
            system_requirements,
            status: status || 'Live'
        });

        return res.status(200).json({
            success: true,
            message: 'Game updated successfully!',
            product: updatedProduct
        });
    } catch (err) {
        console.error('[editProduct]', err);
        return res.status(500).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};

export const renderAddGamePage = async (req, res) => {
    try {
        const categories = await categoryService.getAllActiveCategories();
        const publishers = await Publisher.find({}).sort({ name: 1 }).lean();
        res.render('admin/add-game', {
            categories,
            publishers,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAddGamePage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const addProduct = async (req, res) => {
    try {
        const {
            title,
            publisher,
            release_year,
            price,
            stock,
            category,
            edition_type,
            description
        } = req.body;

        const platformsRaw = req.body['platforms[]'] || req.body.platforms || [];
        const platforms = Array.isArray(platformsRaw) ? platformsRaw : [platformsRaw];

        const platform_stock = [];
        let calculatedTotalStock = 0;
        platforms.forEach(platform => {
            const stockKey = `platform_stock_${platform}`;
            const pStock = Number(req.body[stockKey]) || 0;
            platform_stock.push({ platform, stock: pStock });
            calculatedTotalStock += pStock;
        });

        const fallbackValue = (val, defaultValue) => {
            if (val === undefined || val === null || String(val).trim() === '') {
                return defaultValue;
            }
            return String(val).trim();
        };

        const system_requirements = {
            minimum: {
                architecture: fallbackValue(req.body['system_requirements.minimum.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.minimum.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.minimum.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.minimum.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.minimum.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.minimum.storage'], 'N/A'),
                sound_card: req.body['system_requirements.minimum.sound_card'] || null,
                additional_notes: req.body['system_requirements.minimum.additional_notes'] || null
            },
            recommended: {
                architecture: fallbackValue(req.body['system_requirements.recommended.architecture'], '64-bit'),
                os: fallbackValue(req.body['system_requirements.recommended.os'], 'N/A'),
                processor: fallbackValue(req.body['system_requirements.recommended.processor'], 'N/A'),
                memory: fallbackValue(req.body['system_requirements.recommended.memory'], 'N/A'),
                graphics: fallbackValue(req.body['system_requirements.recommended.graphics'], 'N/A'),
                storage: fallbackValue(req.body['system_requirements.recommended.storage'], 'N/A'),
                sound_card: req.body['system_requirements.recommended.sound_card'] || null,
                additional_notes: req.body['system_requirements.recommended.additional_notes'] || null
            }
        };

        const coverFiles = req.files && req.files.cover_image ? req.files.cover_image : [];
        const galleryFiles = req.files && req.files.gallery ? req.files.gallery : [];

        if (coverFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'Cover image is required.' });
        }
        if (galleryFiles.length < 1) {
            return res.status(400).json({ success: false, message: 'At least 1 gallery file is required.' });
        }

        // Upload files to Cloudinary using memory buffer
        const coverUploadResult = await uploadToCloudinary(coverFiles[0], 'pixelplay_uploads');
        const cover_image = coverUploadResult.secure_url;

        const galleryUploadPromises = galleryFiles.map(file => uploadToCloudinary(file, 'pixelplay_uploads'));
        const galleryUploadResults = await Promise.all(galleryUploadPromises);
        const gallery = galleryUploadResults.map(res => res.secure_url);

        const newProduct = await productService.createProduct({
            title,
            publisher,
            release_year: Number(release_year),
            price: Number(price),
            stock: calculatedTotalStock,
            platform_stock,
            category,
            platforms,
            edition_type,
            description,
            cover_image,
            gallery,
            system_requirements
        });

        return res.status(201).json({
            success: true,
            message: 'Game published successfully!',
            product: newProduct
        });
    } catch (err) {
        console.error('[addProduct]', err);
        return res.status(500).json({ success: false, message: err.message || 'An unexpected error occurred.' });
    }
};

export const renderCategoryManagement = async (req, res) => {
    try {
        const categoriesRaw = await Category.find({}).lean();
        
        // Enrich category objects with dynamically computed game counts
        const categories = await Promise.all(categoriesRaw.map(async (cat) => {
            const gameCount = await Product.countDocuments({ category: cat._id });
            return {
                ...cat,
                gameCount,
                defaultOffer: cat.defaultOffer || 0,
                status: cat.status || 'Live'
            };
        }));

        res.render('admin/add-category', {
            categories,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderCategoryManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const createCategory = async (req, res) => {
    try {
        const { name, defaultOffer, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).send('Category name is required.');
        }

        const existing = await Category.findOne({ name: name.trim() });
        if (existing) {
            return res.status(400).send('Category already exists.');
        }

        let parsedOffer = 0;
        if (defaultOffer) {
            const cleaned = defaultOffer.replace(/[^\d.]/g, '');
            parsedOffer = parseFloat(cleaned) || 0;
        }

        let iconUrl = '';
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            iconUrl = uploadResult.secure_url;
        }

        await Category.create({ 
            name: name.trim(),
            defaultOffer: parsedOffer,
            description: description?.trim() || '',
            icon: iconUrl
        });
        res.redirect('/admin/categories');
    } catch (err) {
        console.error('[createCategory]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        const currentStatus = category.status || 'Live';
        const newStatus = currentStatus === 'Live' ? 'Hidden' : 'Live';

        if (newStatus === 'Hidden') {
            const gameCount = await Product.countDocuments({ category: id });
            if (gameCount > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please change the category of associated games before unlisting this category.'
                });
            }
        }

        category.status = newStatus;
        await category.save();

        return res.status(200).json({
            success: true,
            status: newStatus,
            message: `Category has been ${newStatus === 'Live' ? 'listed' : 'unlisted'}.`
        });
    } catch (err) {
        console.error('[toggleCategoryStatus]', err);
        return res.status(500).json({ success: false, message: 'Internal Server Error.' });
    }
};

export const renderEditCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id).lean();
        if (!category) {
            return res.status(404).send('Category not found');
        }

        const linkedGamesCount = await Product.countDocuments({ category: id });

        res.render('admin/edit-category', {
            category,
            linkedGamesCount,
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
        
        if (!name || !name.trim()) {
            return res.status(400).send('Category name is required.');
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).send('Category not found.');
        }

        // Server-side validation: block unlisting if games are linked
        if (status === 'Hidden') {
            const gameCount = await Product.countDocuments({ category: id });
            if (gameCount > 0) {
                return res.status(400).send('Please change the category of associated games before unlisting this category.');
            }
        }

        const conflict = await Category.findOne({ name: name.trim(), _id: { $ne: id } });
        if (conflict) {
            return res.status(400).send('Category name already exists.');
        }

        let parsedOffer = 0;
        if (defaultOffer) {
            const cleaned = defaultOffer.replace(/[^\d.]/g, '');
            parsedOffer = parseFloat(cleaned) || 0;
        }

        let iconUrl = category.icon;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            iconUrl = uploadResult.secure_url;
        }

        category.name = name.trim();
        category.defaultOffer = parsedOffer;
        category.description = description?.trim() || '';
        category.status = status || category.status || 'Live';
        category.icon = iconUrl;

        await category.save();
        res.redirect('/admin/categories');
    } catch (err) {
        console.error('[editCategory]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const linkedGamesCount = await Product.countDocuments({ category: id });
        if (linkedGamesCount > 0) {
            return res.status(400).json({ success: false, message: 'Deletion blocked: change the category of associated games first.' });
        }

        const deleted = await Category.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        return res.status(200).json({ success: true, message: 'Category deleted successfully.' });
    } catch (err) {
        console.error('[deleteCategory]', err);
        return res.status(500).json({ success: false, message: 'Internal Server Error.' });
    }
};

export const renderPublisherManagement = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        // Retrieve publishers from the Publisher collection
        let savedPublishers = await Publisher.find({}).lean();
        if (savedPublishers.length === 0) {
            // Seed from distinct products if currently empty
            const productPubs = await Product.distinct('publisher');
            if (productPubs.length > 0) {
                await Promise.all(productPubs.map(name => 
                    Publisher.create({ name, description: 'Seeded from existing products' })
                ));
                savedPublishers = await Publisher.find({}).lean();
            }
        }

        // Apply in-memory search
        if (search && search.trim()) {
            const queryStr = search.trim().toLowerCase();
            savedPublishers = savedPublishers.filter(pub => pub.name.toLowerCase().includes(queryStr));
        }

        // Enrich with gameCount and format structure
        let publishers = await Promise.all(savedPublishers.map(async (pub) => {
            const gameCount = await Product.countDocuments({ publisher: pub.name });
            return {
                _id: pub._id,
                name: pub.name,
                logo: pub.logo || null,
                website: pub.website || null,
                description: pub.description || 'Dynamically aggregated from product catalog',
                gameCount
            };
        }));

        // Sort alphabetically
        publishers.sort((a, b) => a.name.localeCompare(b.name));

        // Pagination
        const totalCount = publishers.length;
        const totalPages = Math.ceil(totalCount / limitNum);
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedPublishers = publishers.slice(startIndex, startIndex + limitNum);

        res.render('admin/listed-publishers', {
            publishers: paginatedPublishers,
            currentPage: pageNum,
            totalPages,
            totalCount,
            limit: limitNum,
            search,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderPublisherManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderAddPublisherPage = (req, res) => {
    try {
        res.render('admin/add-publisher', {
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderAddPublisherPage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const createPublisher = async (req, res) => {
    try {
        const { publisher_name, official_website, brief_description } = req.body;
        
        if (!publisher_name || !publisher_name.trim()) {
            return res.status(400).send('Publisher name is required.');
        }

        const existing = await Publisher.findOne({ name: { $regex: new RegExp(`^${publisher_name.trim()}$`, 'i') } });
        if (existing) {
            return res.status(400).send('Publisher already exists.');
        }

        let logoUrl = '';
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            logoUrl = uploadResult.secure_url;
        }

        await Publisher.create({
            name: publisher_name.trim(),
            website: official_website?.trim() || '',
            logo: logoUrl,
            description: brief_description?.trim() || ''
        });

        res.redirect('/admin/publishers');
    } catch (err) {
        console.error('[createPublisher]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderEditPublisherPage = async (req, res) => {
    try {
        const publisher = await Publisher.findById(req.params.id).lean();
        if (!publisher) {
            return res.status(404).send('Publisher not found');
        }
        res.render('admin/edit-publisher', {
            publisher,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderEditPublisherPage]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const editPublisher = async (req, res) => {
    try {
        const publisher = await Publisher.findById(req.params.id);
        if (!publisher) {
            return res.status(404).send('Publisher not found');
        }

        const { publisher_name, official_website, studio_description, is_listed } = req.body;
        
        if (!publisher_name || !publisher_name.trim()) {
            return res.status(400).send('Publisher name is required.');
        }

        const existing = await Publisher.findOne({ 
            name: { $regex: new RegExp(`^${publisher_name.trim()}$`, 'i') }, 
            _id: { $ne: publisher._id } 
        });
        if (existing) {
            return res.status(400).send('Publisher already exists.');
        }

        let logoUrl = publisher.logo;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            logoUrl = uploadResult.secure_url;
        }

        const oldName = publisher.name;
        const newName = publisher_name.trim();

        publisher.name = newName;
        publisher.website = official_website?.trim() || '';
        publisher.logo = logoUrl;
        publisher.description = studio_description?.trim() || '';
        publisher.is_listed = is_listed === 'true';

        await publisher.save();

        if (oldName !== newName) {
            await Product.updateMany({ publisher: oldName }, { publisher: newName });
        }

        res.redirect('/admin/publishers');
    } catch (err) {
        console.error('[editPublisher]', err);
        res.status(500).send('Internal Server Error');
    }
};

