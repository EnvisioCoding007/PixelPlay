import { upload } from '../config/cloudinary.js';

const uploadFields = upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'gallery', maxCount: 5 }
]);

export const handleProductUploads = (req, res, next) => {
    uploadFields(req, res, (err) => {
        if (err) {
            console.error('[Multer/Cloudinary Upload Error]', err);
            return res.status(400).json({ 
                success: false, 
                message: err.message || 'File upload failed. Please verify format and size.' 
            });
        }
        next();
    });
};
