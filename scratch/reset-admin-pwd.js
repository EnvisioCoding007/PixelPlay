import mongoose from 'mongoose';
import User from '../models/User.js';
import connectDB from '../db.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
process.env.MONGO_URI = 'mongodb://localhost:27017/pixelplay';

async function main() {
    await connectDB();
    const email = 'envisiomusic@gmail.com';
    const password = 'AdminPassword123!';
    const password_hash = await bcrypt.hash(password, 10);
    const result = await User.updateOne({ email }, { password_hash });
    console.log("Password reset result:", result);
    await mongoose.disconnect();
}
main().catch(console.error);
