import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    otp: {
        type: String,
        required: true,
    },
    purpose: {
        type: String,
        required: true,
        enum: ["signup", "email_update", "forgot"],
    },
    is_used: {
        type: Boolean,
        default: false,
    },
    expires_at: {
        type: Date,
        required: true,
    },
    attempts: {
        type: Number,
        default: 0
    },
},
    { timestamps: true });

otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

otpSchema.index({ email: 1, purpose: 1 });

const OTP = mongoose.model("OTP", otpSchema);

export default OTP;