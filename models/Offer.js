import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    targetType: {
        type: String,
        enum: ['Category', 'Product', 'Publisher'],
        required: true
    },
    targetCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    targetProduct: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        default: null
    },
    targetPublisher: {
        type: String,
        trim: true,
        default: null
    },
    discountType: {
        type: String,
        enum: ['percentage', 'flat'],
        default: 'percentage'
    },
    discountValue: {
        type: Number, // Percentage value (e.g. 20 for 20%) OR Flat amount in Paisa
        required: true,
        min: 0
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

offerSchema.index({ isActive: 1, expiryDate: 1 });
offerSchema.index({ targetType: 1 });
offerSchema.index({ targetCategory: 1 });
offerSchema.index({ targetProduct: 1 });
offerSchema.index({ targetPublisher: 1 });

const Offer = mongoose.model('Offer', offerSchema);

export default Offer;
