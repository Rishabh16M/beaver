const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beaver_workspace';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ [Workspace-Service] Connected to MongoDB.');
  } catch (error) {
    console.error('❌ [Workspace-Service] MongoDB connection failed:', error.message);
    throw error;
  }
}

const WorkspaceModel = {
  find: (...args) => mongoose.model('Workspace').find(...args),
  findOne: (...args) => mongoose.model('Workspace').findOne(...args),
  findById: (...args) => mongoose.model('Workspace').findById(...args),
  create: (...args) => mongoose.model('Workspace').create(...args),
  updateOne: (...args) => mongoose.model('Workspace').updateOne(...args)
};

const TaskModel = {
  find: (...args) => mongoose.model('Task').find(...args),
  findOne: (...args) => mongoose.model('Task').findOne(...args),
  findById: (...args) => mongoose.model('Task').findById(...args),
  create: (...args) => mongoose.model('Task').create(...args),
  updateOne: (...args) => mongoose.model('Task').updateOne(...args),
  deleteOne: (...args) => mongoose.model('Task').deleteOne(...args)
};

const FileModel = {
  find: (...args) => mongoose.model('File').find(...args),
  findOne: (...args) => mongoose.model('File').findOne(...args),
  create: (...args) => mongoose.model('File').create(...args)
};

module.exports = {
  connectDB,
  WorkspaceModel,
  TaskModel,
  FileModel
};
