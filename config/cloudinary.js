import {v2 as cloudinary} from 'cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Use memory storage to avoid compatibility issues with multer-storage-cloudinary and multer v2
const storageEngine = multer.memoryStorage();
export const upload = multer({ storage: storageEngine });

/**
 * Uploads a file buffer from multer.memoryStorage to Cloudinary
 * @param {Object} file - Multer file object
 * @param {string} folder - Destination folder on Cloudinary
 * @returns {Promise<Object>} - Cloudinary upload response object
 */
export const uploadToCloudinary = (file, folder) => {
    return new Promise((resolve, reject) => {
        const fileExt = file.originalname.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(fileExt) || 
                        (file.mimetype && file.mimetype.startsWith('video'));
        
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: isVideo ? 'video' : 'image',
                public_id: Date.now() + '-' + file.originalname.split('.')[0]
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result);
            }
        );
        uploadStream.end(file.buffer);
    });
};