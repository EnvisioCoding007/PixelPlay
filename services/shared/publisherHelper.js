import Publisher from '../../models/Publisher.js';

export const getAllPublishersSorted = async () => {
    try {
        return await Publisher.find({ status: 'Live' }).sort({ name: 1 }).lean();
    } catch (error) {
        console.error('[publisherHelper.getAllPublishersSorted] Error:', error);
        throw error;
    }
};
