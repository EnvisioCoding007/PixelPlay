import mongoose from 'mongoose';
import User from '../models/User.js';
import connectDB from '../db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
process.env.MONGO_URI = 'mongodb://localhost:27017/pixelplay';

async function main() {
    await connectDB();
    const admins = await User.find({ role: 'admin' });
    console.log("Admin users in DB:", JSON.stringify(admins, null, 2));
    await mongoose.disconnect();
}
main().catch(console.error);
