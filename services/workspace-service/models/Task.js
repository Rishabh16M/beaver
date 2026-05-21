const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  workspaceId: {
    type: String, // Reference to Workspace ID
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'done'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  assignee: {
    type: String, // User ID of assignee
    default: null
  },
  assigneeName: {
    type: String,
    default: ''
  },
  assignedBy: {
    type: String, // User ID of who assigned it
    required: true
  },
  assignedByName: {
    type: String,
    default: ''
  },
  dueDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.Task || mongoose.model('Task', TaskSchema);
