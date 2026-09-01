import Platform from '../../models/Platform.js';

export const validatePlatformData = (data = {}) => {
    const errors = {};

    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        errors.name = 'Platform name is required.';
    } else if (data.name.trim().length < 2) {
        errors.name = 'Platform name must be at least 2 characters long.';
    } else if (data.name.trim().length > 50) {
        errors.name = 'Platform name cannot exceed 50 characters.';
    }

    if (!data.abbreviation || typeof data.abbreviation !== 'string' || !data.abbreviation.trim()) {
        errors.abbreviation = 'Platform abbreviation is required.';
    } else if (data.abbreviation.trim().length < 2) {
        errors.abbreviation = 'Platform abbreviation must be at least 2 characters long.';
    } else if (data.abbreviation.trim().length > 15) {
        errors.abbreviation = 'Platform abbreviation cannot exceed 15 characters.';
    }

    if (data.description && typeof data.description === 'string' && data.description.trim().length > 500) {
        errors.description = 'Description cannot exceed 500 characters.';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};

export const getAllActivePlatforms = async () => {
    try {
        return await Platform.find({ is_listed: { $ne: false } }).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[platformHelper.getAllActivePlatforms] Error:', error);
        throw error;
    }
};

export const getAllPlatforms = async () => {
    try {
        return await Platform.find({}).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[platformHelper.getAllPlatforms] Error:', error);
        throw error;
    }
};
