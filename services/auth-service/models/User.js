const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['Employee'],
    default: 'Employee'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Avoid model recompilation errors
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
