import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        platform: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number, // Stored in Paisa (whole integer)
            required: true
        },
        status: {
            type: String,
            enum: ['Ordered', 'Cancelled', 'Return Requested', 'Returned'],
            default: 'Ordered'
        },
        cancellationDate: {
            type: Date,
            default: null
        },
        cancellationReason: {
            type: String,
            default: null
        },
        cancellationComments: {
            type: String,
            default: null
        },
        returnDate: {
            type: Date,
            default: null
        },
        returnReason: {
            type: String,
            default: null
        },
        returnComments: {
            type: String,
            default: null
        },
        adminReturnComment: {
            type: String,
            default: null
        }
    }],
    deliveryAddress: {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        addressLine1: { type: String, required: true },
        addressLine2: { type: String, default: "" },
        city: { type: String, required: true },
        state: { type: String, required: true },
        postal_code: { type: Number, required: true },
        country: { type: String, required: true }
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'Razorpay', 'PixelWallet', 'UPI'],
        default: 'COD'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Processing', 'Shipped', 'Delivered', 'Return Requested', 'Returned', 'Cancelled'],
        default: 'Processing'
    },
    subtotal: {
        type: Number, // Stored in Paisa (whole integer)
        required: true
    },
    tax: {
        type: Number, // Stored in Paisa (whole integer)
        required: true
    },
    shipping: {
        type: Number, // Stored in Paisa (whole integer)
        required: true
    },
    discount: {
        type: Number, // Stored in Paisa (whole integer)
        default: 0
    },
    finalAmount: {
        type: Number, // Stored in Paisa (whole integer)
        required: true
    },
    transactionId: {
        type: String,
        default: null
    },
    cancellationDate: {
        type: Date,
        default: null
    },
    cancellationReason: {
        type: String,
        default: null
    },
    cancellationComments: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

orderSchema.index({ createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
