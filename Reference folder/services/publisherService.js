import Publisher from '../models/Publisher.js';
import Product from '../models/Product.js';

export const getAllPublishersAdmin = async (search = '', sort = 'latest', page = 1, limit = 8) => {
    try {
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.max(1, parseInt(limit, 10));

        let sortConfig = { createdAt: -1 };
        if (sort === 'oldest') {
            sortConfig = { createdAt: 1 };
        } else if (sort === 'A-Z') {
            sortConfig = { name: 1 };
        } else if (sort === 'Z-A') {
            sortConfig = { name: -1 };
        }

        let savedPublishers = await Publisher.find({}).sort(sortConfig).lean();
        if (savedPublishers.length === 0) {
            const productPubs = await Product.distinct('publisher');
            if (productPubs.length > 0) {
                await Promise.all(productPubs.map(name => 
                    Publisher.create({ name, description: 'Seeded from existing products' })
                ));
                savedPublishers = await Publisher.find({}).sort(sortConfig).lean();
            }
        }

        if (search && search.trim()) {
            const queryStr = search.trim().toLowerCase();
            savedPublishers = savedPublishers.filter(pub => pub.name.toLowerCase().includes(queryStr));
        }

        const publishers = await Promise.all(savedPublishers.map(async (pub) => {
            const gameCount = await Product.countDocuments({ publisher: pub.name });
            return {
                _id: pub._id,
                name: pub.name,
                logo: pub.logo || null,
                website: pub.website || null,
                description: pub.description || 'Dynamically aggregated from product catalog',
                gameCount,
                is_listed: pub.is_listed !== false
            };
        }));

        const totalCount = publishers.length;
        const totalPages = Math.ceil(totalCount / limitNum);
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedPublishers = publishers.slice(startIndex, startIndex + limitNum);

        return {
            publishers: paginatedPublishers,
            currentPage: pageNum,
            totalPages,
            totalCount
        };
    } catch (error) {
        console.error('[publisherService.getAllPublishersAdmin] Error:', error);
        throw error;
    }
};

export const getAllPublishersSorted = async () => {
    try {
        return await Publisher.find({}).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[publisherService.getAllPublishersSorted] Error:', error);
        throw error;
    }
};

export const getPublisherById = async (id) => {
    try {
        return await Publisher.findById(id).lean();
    } catch (error) {
        console.error('[publisherService.getPublisherById] Error:', error);
        throw error;
    }
};

export const createPublisher = async ({ name, website, logo, description }) => {
    try {
        if (!name || !name.trim()) {
            throw new Error('Publisher name is required.');
        }

        if (name.trim().length > 50) {
            throw new Error('Publisher name cannot exceed 50 characters.');
        }

        if (website && website.trim().length > 200) {
            throw new Error('Official website URL cannot exceed 200 characters.');
        }

        if (description && description.trim().length > 1000) {
            throw new Error('Publisher description cannot exceed 1000 characters.');
        }

        const existing = await Publisher.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
        if (existing) {
            throw new Error('Publisher already exists.');
        }

        return await Publisher.create({
            name: name.trim(),
            website: website?.trim() || '',
            logo: logo || '',
            description: description?.trim() || ''
        });
    } catch (error) {
        console.error('[publisherService.createPublisher] Error:', error);
        throw error;
    }
};

export const updatePublisher = async (id, { name, website, logo, description, is_listed }) => {
    try {
        if (!name || !name.trim()) {
            throw new Error('Publisher name is required.');
        }

        if (name.trim().length > 50) {
            throw new Error('Publisher name cannot exceed 50 characters.');
        }

        if (website && website.trim().length > 200) {
            throw new Error('Official website URL cannot exceed 200 characters.');
        }

        if (description && description.trim().length > 1000) {
            throw new Error('Publisher description cannot exceed 1000 characters.');
        }

        const publisher = await Publisher.findById(id);
        if (!publisher) {
            throw new Error('Publisher not found');
        }

        const existing = await Publisher.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, 
            _id: { $ne: publisher._id } 
        });
        if (existing) {
            throw new Error('Publisher already exists.');
        }

        const oldName = publisher.name;
        const newName = name.trim();

        publisher.name = newName;
        publisher.website = website?.trim() || '';
        if (logo !== undefined) {
            publisher.logo = logo;
        }
        publisher.description = description?.trim() || '';
        publisher.is_listed = is_listed === true || is_listed === 'true';

        await publisher.save();

        if (oldName !== newName) {
            await Product.updateMany({ publisher: oldName }, { publisher: newName });
        }

        // Cascade unlist all affiliated games if the publisher is unlisted
        if (publisher.is_listed === false) {
            await Product.updateMany({ publisher: newName }, { status: 'Hidden' });
        }

        return publisher;
    } catch (error) {
        console.error('[publisherService.updatePublisher] Error:', error);
        throw error;
    }
};
