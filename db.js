import mongoose from 'mongoose';

const connectDB = async()=>{
    try{
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Database connected successfully.');

        // Drop the old case-sensitive indexes if they exist, so Mongoose can recreate them with case-insensitive collation
        try {
            const db = mongoose.connection.db;
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);

            if (collectionNames.includes('categories')) {
                await db.collection('categories').dropIndex('name_1');
                console.log('Dropped old case-sensitive index for categories.');
            }
            if (collectionNames.includes('publishers')) {
                await db.collection('publishers').dropIndex('name_1');
                console.log('Dropped old case-sensitive index for publishers.');
            }
        } catch (idxError) {
            // Ignore index drop errors if index doesn't exist or already dropped
            console.log('Index drop helper run finished (non-critical if index was already dropped or did not exist).');
        }

    } catch(error){
        console.log('Failed to connect to database');
        console.error(error);

        process.exit(1);
    }
}
export default connectDB;