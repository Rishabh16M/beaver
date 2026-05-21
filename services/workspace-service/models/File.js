const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  workspaceId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  url: {
    type: String, // Can store local path or base64 attachment
    required: true
  },
  size: {
    type: Number, // File size in bytes
    required: true
  },
  type: {
    type: String, // MIME type (e.g. image/png, application/pdf)
    required: true
  },
  uploadedBy: {
    type: String, // User ID of creator
    required: true
  },
  uploadedByName: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.File || mongoose.model('File', FileSchema);
