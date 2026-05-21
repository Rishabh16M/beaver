const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  workspaceCode: {
    type: String,
    required: true
  },
  sender: {
    id: String,
    name: String,
    email: String,
    employeeId: String,
    role: String
  },
  text: {
    type: String,
    required: true
  },
  isAi: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
