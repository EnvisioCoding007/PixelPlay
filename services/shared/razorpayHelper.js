import Razorpay from 'razorpay';
import crypto from 'crypto';

const getRazorpayInstance = () => {
    return new Razorpay({
        key_id: process.env.RAZORPAY_TEST_KEY_ID,
        key_secret: process.env.RAZORPAY_TEST_KEY_SECRET
    });
};

/**
 * Creates a Razorpay order for the specified amount (in Paisa)
 */
export const createRazorpayOrder = async (amountInPaisa, receiptId) => {
    const razorpay = getRazorpayInstance();
    const options = {
        amount: Math.round(amountInPaisa),
        currency: 'INR',
        receipt: receiptId,
        payment_capture: 1
    };
    return await razorpay.orders.create(options);
};

/**
 * Verifies the Razorpay payment signature
 */
export const verifyRazorpaySignature = (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return false;
    }
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_TEST_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    return expectedSignature === razorpaySignature;
};

/**
 * Returns the public Razorpay Key ID for client-side Checkout SDK initialization
 */
export const getRazorpayKeyId = () => {
    return process.env.RAZORPAY_TEST_KEY_ID;
};
