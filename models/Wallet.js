import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    transactionId: {
        type: String,
        required: true,
        default: () => `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    },
    amount: {
        type: Number, // Stored in Paisa (integer)
        required: true,
        min: 0
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    orderId: {
        type: String, // Stored as order string ID (e.g. PX-xxx) if related to an order
        default: null
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['Success', 'Pending', 'Failed'],
        default: 'Success'
    }
}, { _id: true });

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number, // Stored in Paisa (integer)
        required: true,
        default: 0
    },
    transactions: [transactionSchema]
}, { timestamps: true });

walletSchema.index({ 'transactions.orderId': 1 });

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;
