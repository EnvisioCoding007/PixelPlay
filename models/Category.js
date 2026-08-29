import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
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
        type: String,
        required:true
    }
}, {
    timestamps: true
});

categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const Category = mongoose.model('Category', categorySchema);
export default Category;



