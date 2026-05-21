const mongoose = require('mongoose');

const WorkspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  boss: {
    type: String, // Storing user ID
    required: true
  },
  members: {
    type: [String], // Array of User IDs
    default: []
  },
  admins: {
    type: [String], // Array of User IDs who are admins
    default: []
  },
  memberPermissions: {
    type: [{
      userId: { type: String, required: true },
      canRead: { type: Boolean, default: true },
      canWrite: { type: Boolean, default: true }
    }],
    default: []
  },
  permissionRequests: {
    type: [{
      requestId: { type: String, required: true },
      userId: { type: String, required: true },
      userName: { type: String, required: true },
      userEmail: { type: String, required: true },
      requestType: { type: String, enum: ['read', 'write', 'both'], required: true },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  },
  employeeAssignPermissions: {
    type: Boolean,
    default: false // Boss sets this. If true, employees can allocate tasks to other employees.
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.Workspace || mongoose.model('Workspace', WorkspaceSchema);
