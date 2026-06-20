import mongoose from 'mongoose';
import Product from '../models/Product.js';
import connectDB from '../db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
process.env.MONGO_URI = 'mongodb://localhost:27017/pixelplay';

async function main() {
    await connectDB();
    const game = await Product.findOne({ title: /cricket/i });
    console.log("Game document in DB:", JSON.stringify(game, null, 2));
    await mongoose.disconnect();
}
main().catch(console.error);
