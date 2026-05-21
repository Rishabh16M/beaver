const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beaver_chat';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ [Chat-Service] Connected to MongoDB.');
  } catch (error) {
    console.error('❌ [Chat-Service] MongoDB connection failed:', error.message);
    throw error;
  }
}

const MessageModel = {
  find: (query) => mongoose.model('Message').find(query).sort({ createdAt: 1 }),
  create: (...args) => mongoose.model('Message').create(...args)
};

module.exports = {
  connectDB,
  MessageModel
};
