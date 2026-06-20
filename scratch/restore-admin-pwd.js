import mongoose from 'mongoose';
import User from '../models/User.js';
import connectDB from '../db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
process.env.MONGO_URI = 'mongodb://localhost:27017/pixelplay';

async function main() {
    await connectDB();
    const email = 'envisiomusic@gmail.com';
    const password_hash = '$2b$10$AcY3YSs3xthFC2I7Z75ZiuTsEBwppBcawrTivP85wF8qxbPzriHh.';
    const result = await User.updateOne({ email }, { password_hash });
    console.log("Password restore result:", result);
    await mongoose.disconnect();
}
main().catch(console.error);
