import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';

dotenv.config();

const seedCategories = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.error('MONGO_URI is not defined in the environment variables.');
            process.exit(1);
        }

        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Database connected successfully.');

        // Clear existing categories
        console.log('Clearing existing categories...');
        await Category.deleteMany({});
        console.log('Existing categories cleared.');

        // Foundation categories to insert
        const categoriesData = [
            { name: 'Action' },
            { name: 'RPG' },
            { name: 'Racing' },
            { name: 'Shooter' },
            { name: 'Sports' },
            { name: 'Adventure' },
            { name: 'Strategy' },
            { name: 'Simulation' }
        ];

        console.log('Inserting standard categories...');
        const inserted = await Category.insertMany(categoriesData);
        console.log(`Successfully seeded ${inserted.length} categories:`);
        inserted.forEach(cat => console.log(` - ${cat.name} (${cat._id})`));

        await mongoose.disconnect();
        console.log('Database disconnected successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to seed categories:', error);
        process.exit(1);
    }
};

seedCategories();
