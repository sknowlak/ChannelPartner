const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true, index: true },
    email: { type: String, index: true },
    alternateMobile: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
