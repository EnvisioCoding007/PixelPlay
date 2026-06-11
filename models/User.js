import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
    },
    addressLine1: {
        type: String,
        required: true,
        trim: true,
    },
    addressLine2: {
        type: String,
        trim: true,
        default: "",
    },
    city: {
        type: String,
        required: true,
        trim: true,
    },
    state: {
        type: String,
        required: true,
        trim: true,
    },
    postal_code: {
        type: Number,
        required: true,
    },
    country: {
        type: String,
        required: true,
        trim: true,
        default: "India",
    },
    address_type: {
        type: String,
        enum: ["home", "office", "other"],
        default: "home",
    },
    isDefault: {
        type: Boolean,
        default: false,
    },

},
    { _id: true }
);

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,

    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password_hash: {
        type: String,
        default: null,
    },

    profile_image: {
        type: String,
        default: null,
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
    },
    location: {
        type: String,
        trim: true,
        default: null,
    },

    phone: {
        type: String,
        trim: true,
        default: null,
    },

    addresses: {
        type: [addressSchema],
        default: [],
    },

    referral_code: {
        type: String,
        unique: true,
        sparse: true,
    },
    referred_by: {
        type: String,
        default: null,
    },

    google_id: {
        type: String,
        sparse: true,
    },

    is_verified: {
        type: Boolean,
        default: false,
    },
    is_blocked: {
        type: Boolean,
        default: false,
    },

    reset_password_token: {
        type: String,
        default: null,
    },
    reset_password_expires: {
        type: Date,
        default: null,
    },

    pending_email: {
        type: String,
        default: null,
    },

    last_login_at: {
        type: Date,
        default: null,
    },

},
    { timestamps: true, });

userSchema.index({ createdAt: -1 });

userSchema.index({ username: "text", email: "text" });

userSchema.index({ is_blocked: 1 });

userSchema.index({ role: 1 })

const User = mongoose.model("User", userSchema);

export default User;