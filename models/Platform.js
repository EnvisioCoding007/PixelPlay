import mongoose from 'mongoose';

const platformSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    abbreviation: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
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

platformSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
platformSchema.index({ abbreviation: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const Platform = mongoose.model('Platform', platformSchema);
export default Platform;
