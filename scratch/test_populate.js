import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

dotenv.config();
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixelplay';

async function run() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB:', uri);

    const filterCategory = 'Action'; // which is a new category
    const catDoc = await Category.findOne({ name: filterCategory }).lean();
    console.log('Category doc found:', catDoc);

    const query = {};
    if (catDoc) {
      query.category = { $in: [filterCategory, new mongoose.Types.ObjectId(catDoc._id)] };
    } else {
      query.category = filterCategory;
    }

    console.log('Query:', query);

    const totalCount = await Product.collection.countDocuments(query);
    console.log('Raw count:', totalCount);

    const results = await Product.collection.find(query).toArray();
    console.log('Raw results found:', results.length);
    if (results.length > 0) {
      console.log('Matched titles:', results.map(r => r.title));
    }
  } catch (error) {
    console.error('Error during query:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
