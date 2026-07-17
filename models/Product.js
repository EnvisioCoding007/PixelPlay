import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    publisher:{
        type:String,
        required:true,
        trim:true
    },
    release_year:{
        type:Number,
        required:true,
    },
    price: {
        type: Number, // Stored in Paisa (whole integer)
        required: true,
        default: 10000,
        min: 10000,
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
    },
    category:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'Category',
        required: true
    },
    platforms: {
        type: [String],
        required: true,
        default: []
    },
    platform_stock: {
        type: [{
            platform: { type: String, required: true },
            stock: { type: Number, required: true, min: 0, default: 0 },
            price: { type: Number, required: true, min: 10000, default: 10000 } // Stored in Paisa (whole integer)
        }],
        default: []
    },
    edition_type: {
        type: String,
        required:true,
        uppercase: true,
        enum: {
            values: ['STANDARD','LEGENDARY'],
            message: '{VALUE} is not a recognized product edition variant.'
        },
        default: 'STANDARD',
    },
    status: {
        type: String,
        enum: ['Live', 'Hidden'],
        default: 'Live',
    },
    cover_image:{
        type: String,
        required: true
    },
    gallery:{
        type:[String],
        required:true
    },
    description:{
        type: String,
        required:true
    },
    system_requirements:{
        minimum:{
            architecture:{type:String, required:true},
            os:{type:String, required:true},
            processor:{type:String, required:true},
            memory:{type:String, required:true},
            graphics:{type:String, required:true},
            storage:{type:String, required:true},
            sound_card:{type:String, default:null},
            additional_notes:{type:String, default:null}
        },
        recommended:{
            architecture:{type:String, required:true},
            os:{type:String, required:true},
            processor:{type:String, required:true},
            memory:{type:String, required:true},
            graphics:{type:String, required:true},
            storage:{type:String, required:true},
            sound_card:{type:String, default:null},
            additional_notes:{type:String, default:null}
        }
    }
}, {
    timestamps: true
});

productSchema.index({ createdAt: -1 });
productSchema.index({ title: 'text' });

const Product = mongoose.model('Product', productSchema);
export default Product;
