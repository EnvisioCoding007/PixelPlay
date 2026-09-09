import mongoose from 'mongoose';

const userCouponUsageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usedCount: {
        type: Number,
        default: 1,
        min: 0
    },
    lastUsedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'flat'],
        required: true
    },
    discountValue: {
        type: Number, // Percentage value (e.g. 20 for 20%) OR Flat amount in Paisa (integer)
        required: true,
        validate: {
            validator: function(val) {
                return typeof val === 'number' && !isNaN(val) && val > 0;
            },
            message: 'Discount value must be greater than 0'
        }
    },
    minOrderAmount: {
        type: Number, // Stored in Paisa (integer)
        default: 0,
        min: 0
    },
    maxDiscountAmount: {
        type: Number, // Stored in Paisa (integer), applicable for percentage discounts
        default: null,
        validate: {
            validator: function(val) {
                return val === null || val === undefined || (typeof val === 'number' && !isNaN(val) && val > 0);
            },
            message: 'Maximum discount amount must be greater than 0'
        }
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required:true,
    },
    usageLimit: {
        type: Number, // Total maximum redemptions across all users (null = unlimited)
        default: null
    },
    usedCount: {
        type: Number, // Total redemptions performed across all users
        default: 0,
        min: 0
    },
    perUserLimit: {
        type: Number, // Maximum allowed redemptions per user
        default: 1,
        min: 1
    },
    usedBy: [userCouponUsageSchema],
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

couponSchema.pre('validate', function() {
    if (this.discountType === 'flat') {
        if (this.discountValue <= 0) {
            this.invalidate('discountValue', 'Discount amount must be greater than 0');
        }
        if (this.minOrderAmount < this.discountValue + 10000) {
            this.invalidate('minOrderAmount', 'Minimum order amount must be at least ₹100 greater than the flat discount amount');
        }
    } else if (this.discountType === 'percentage') {
        if (this.discountValue <= 0) {
            this.invalidate('discountValue', 'Discount percentage must be greater than 0%');
        }
        if (this.discountValue > 100) {
            this.invalidate('discountValue', 'Discount percentage cannot exceed 100%');
        }
        if (this.maxDiscountAmount !== null && this.maxDiscountAmount !== undefined && this.maxDiscountAmount <= 0) {
            this.invalidate('maxDiscountAmount', 'Maximum discount amount must be greater than 0');
        }
    }
});

couponSchema.index({ isActive: 1, expiryDate: 1 });
couponSchema.index({ 'usedBy.userId': 1 });

const Coupon = mongoose.model('Coupon', couponSchema);

export default Coupon;
