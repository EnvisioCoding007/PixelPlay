import * as publisherService from '../../services/publisherService.js';
import { uploadToCloudinary } from '../../config/cloudinary.js';

export const renderPublisherManagement = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 8, sort = 'latest', success } = req.query;

        const result = await publisherService.getAllPublishersAdmin(search, sort, page, limit);

        res.render('admin/listed-publishers', {
            publishers: result.publishers,
            currentPage: result.currentPage,
            totalPages: result.totalPages,
            totalCount: result.totalCount,
            limit: parseInt(limit, 10),
            search,
            sort,
            success: success || null,
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderPublisherManagement]', err);
        res.status(500).send('Internal Server Error');
    }
};

export const renderAddPublisherPage = (req, res) => {
    try {
        const { error } = req.query;
        res.render('admin/add-publisher', {
            error: error || null,
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

        let logoUrl = '';
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            logoUrl = uploadResult.secure_url;
        }

        await publisherService.createPublisher({
            name: publisher_name,
            website: official_website,
            logo: logoUrl,
            description: brief_description
        });

        res.redirect('/admin/publishers?success=Publisher added successfully.');
    } catch (err) {
        console.error('[createPublisher]', err);
        res.redirect(`/admin/publishers/add?error=${encodeURIComponent(err.message || 'Internal Server Error')}`);
    }
};

export const renderEditPublisherPage = async (req, res) => {
    try {
        const publisher = await publisherService.getPublisherById(req.params.id);
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
        const { publisher_name, official_website, studio_description, is_listed } = req.body;

        let logoUrl = undefined;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file, 'pixelplay_uploads');
            logoUrl = uploadResult.secure_url;
        }

        await publisherService.updatePublisher(req.params.id, {
            name: publisher_name,
            website: official_website,
            logo: logoUrl,
            description: studio_description,
            is_listed: is_listed
        });

        res.redirect('/admin/publishers?success=Publisher updated successfully.');
    } catch (err) {
        console.error('[editPublisher]', err);
        res.status(400).send(err.message || 'Internal Server Error');
    }
};
