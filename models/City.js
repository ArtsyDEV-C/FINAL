const mongoose = require('mongoose');

const CitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const City = mongoose.model('City', CitySchema);
module.exports = City;