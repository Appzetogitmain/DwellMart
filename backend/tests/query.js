import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const plans = await mongoose.connection.db.collection('subscriptionplans').find({}).toArray();
    console.log(JSON.stringify(plans, null, 2));
    process.exit(0);
});
