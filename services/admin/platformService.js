import Platform from '../../models/Platform.js';
import Product from '../../models/Product.js';
import { validatePlatformData } from '../shared/platformHelper.js';

const DEFAULT_PLATFORMS = [
    { name: 'PC', abbreviation: 'PC', description: 'Personal Computer / Windows Gaming' },
    { name: 'PlayStation 5', abbreviation: 'PS5', description: 'Sony PlayStation 5' },
    { name: 'Xbox Series X|S', abbreviation: 'XBSX', description: 'Microsoft Xbox Series X and Series S' },
    { name: 'PlayStation 4', abbreviation: 'PS4', description: 'Sony PlayStation 4' },
    { name: 'Xbox One', abbreviation: 'XBO', description: 'Microsoft Xbox One' },
    { name: 'Nintendo Switch', abbreviation: 'NSW', description: 'Nintendo Switch Hybrid Console' },
    { name: 'PlayStation 3', abbreviation: 'PS3', description: 'Sony PlayStation 3' },
    { name: 'PlayStation 2', abbreviation: 'PS2', description: 'Sony PlayStation 2' },
    { name: 'PlayStation 1', abbreviation: 'PS1', description: 'Sony PlayStation 1' },
    { name: 'Xbox 360', abbreviation: 'X360', description: 'Microsoft Xbox 360' },
    { name: 'Nintendo Wii U', abbreviation: 'WIIU', description: 'Nintendo Wii U Console' },
    { name: 'Nintendo Wii', abbreviation: 'WII', description: 'Nintendo Wii Console' },
    { name: 'Nintendo 3DS', abbreviation: '3DS', description: 'Nintendo 3DS Handheld' },
    { name: 'Nintendo DS', abbreviation: 'NDS', description: 'Nintendo DS Dual-Screen Handheld' },
    { name: 'PlayStation Portable', abbreviation: 'PSP', description: 'Sony PlayStation Portable Handheld' },
    { name: 'PlayStation Vita', abbreviation: 'PSVITA', description: 'Sony PlayStation Vita Handheld' },
    { name: 'Sega Genesis', abbreviation: 'GEN', description: 'Sega Genesis / Mega Drive' },
    { name: 'NES', abbreviation: 'NES', description: 'Nintendo Entertainment System' },
    { name: 'SNES', abbreviation: 'SNES', description: 'Super Nintendo Entertainment System' }
];

export const seedInitialPlatformsIfEmpty = async () => {
    try {
        const count = await Platform.countDocuments();
        if (count === 0) {
            // Also check existing products distinct platforms
            const existingProductPlatforms = await Product.distinct('platforms');
            const platformMap = new Map();

            DEFAULT_PLATFORMS.forEach(p => {
                platformMap.set(p.name.toLowerCase(), p);
            });

            existingProductPlatforms.forEach(name => {
                if (name && !platformMap.has(name.toLowerCase())) {
                    platformMap.set(name.toLowerCase(), {
                        name: name.trim(),
                        abbreviation: name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PLAT',
                        description: 'Discovered from product catalog'
                    });
                }
            });

            const toInsert = Array.from(platformMap.values());
            await Platform.insertMany(toInsert, { ordered: false }).catch(() => {});
        }
    } catch (error) {
        console.error('[platformService.seedInitialPlatformsIfEmpty] Error:', error);
    }
};

export const getAllPlatformsSorted = async () => {
    try {
        await seedInitialPlatformsIfEmpty();
        return await Platform.find({}).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[platformService.getAllPlatformsSorted] Error:', error);
        throw error;
    }
};

export const getAllPlatformNames = async () => {
    try {
        const platforms = await getAllPlatformsSorted();
        return platforms.map(p => p.name);
    } catch (error) {
        console.error('[platformService.getAllPlatformNames] Error:', error);
        throw error;
    }
};

export const getPlatformById = async (id) => {
    try {
        return await Platform.findById(id).lean();
    } catch (error) {
        console.error('[platformService.getPlatformById] Error:', error);
        throw error;
    }
};

export const getPlatformByName = async (name) => {
    try {
        if (!name || typeof name !== 'string') return null;
        return await Platform.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
        }).lean();
    } catch (error) {
        console.error('[platformService.getPlatformByName] Error:', error);
        throw error;
    }
};

export const createPlatform = async ({ name, abbreviation, description, is_listed = true }) => {
    try {
        const validation = validatePlatformData({ name, abbreviation, description });
        if (!validation.isValid) {
            const firstErrorKey = Object.keys(validation.errors)[0];
            throw new Error(validation.errors[firstErrorKey]);
        }

        const trimmedName = name.trim();
        const trimmedAbbr = abbreviation.trim().toUpperCase();

        const existingByName = await Platform.findOne({
            name: { $regex: new RegExp(`^${trimmedName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
        });
        if (existingByName) {
            throw new Error(`Platform with name "${trimmedName}" already exists.`);
        }

        const existingByAbbr = await Platform.findOne({
            abbreviation: { $regex: new RegExp(`^${trimmedAbbr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
        });
        if (existingByAbbr) {
            throw new Error(`Platform abbreviation "${trimmedAbbr}" is already used by "${existingByAbbr.name}".`);
        }

        const platform = new Platform({
            name: trimmedName,
            abbreviation: trimmedAbbr,
            description: description?.trim() || '',
            is_listed: is_listed !== false
        });

        return await platform.save();
    } catch (error) {
        console.error('[platformService.createPlatform] Error:', error);
        throw error;
    }
};
