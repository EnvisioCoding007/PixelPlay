import * as platformService from '../../services/admin/platformService.js';

export const createPlatform = async (req, res) => {
    try {
        const { name, abbreviation, description, is_listed } = req.body;

        const newPlatform = await platformService.createPlatform({
            name,
            abbreviation,
            description,
            is_listed: is_listed !== false
        });

        return res.status(201).json({
            success: true,
            message: `Platform "${newPlatform.name}" added successfully.`,
            platform: newPlatform
        });
    } catch (err) {
        console.error('[platformController.createPlatform]', err);
        return res.status(400).json({
            success: false,
            message: err.message || 'Failed to add platform.'
        });
    }
};

export const getPlatformsJson = async (req, res) => {
    try {
        const platforms = await platformService.getAllPlatformsSorted();
        return res.status(200).json({
            success: true,
            platforms
        });
    } catch (err) {
        console.error('[platformController.getPlatformsJson]', err);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error while fetching platforms.'
        });
    }
};
