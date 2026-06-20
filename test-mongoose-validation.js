import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pixelplay')
  .then(async () => {
    try {
      const p = new Product({
        title: 'Test Game',
        publisher: 'Test Pub',
        release_year: 2024,
        price: 50,
        stock: 10,
        category: new mongoose.Types.ObjectId(),
        edition_type: 'STANDARD',
        cover_image: 'test.jpg',
        gallery: ['test.jpg'],
        description: 'Desc',
        platforms: ['PS5'],
        system_requirements: {
          minimum: {
            architecture: '',
            os: 'PS5 OS',
            processor: '',
            memory: '',
            graphics: '4K',
            storage: '100GB',
            sound_card: '',
            additional_notes: ''
          },
          recommended: {
            architecture: '',
            os: '',
            processor: '',
            memory: '',
            graphics: '',
            storage: '',
            sound_card: '',
            additional_notes: ''
          }
        }
      });
      await p.validate();
      console.log('Validation passed!');
    } catch (err) {
      console.error('Validation failed:', err.message);
    }
    mongoose.disconnect();
  });
