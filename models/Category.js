import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    defaultOffer: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Live', 'Hidden'],
        default: 'Live'
    },
    description: {
        type: String,
        trim: true
    },
    icon: {
        type: String
    }
}, {
    timestamps: true
});

const Category = mongoose.model('Category', categorySchema);
export default Category;



