import mongoose from 'mongoose';

const publisherSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    website: {
        type: String,
        trim: true,
        default: ''
    },
    logo: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    is_listed: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Publisher = mongoose.model('Publisher', publisherSchema);
export default Publisher;
