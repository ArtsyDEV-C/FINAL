import mongoose from 'mongoose';

const CitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

const City = mongoose.model("City", CitySchema);
export default City;