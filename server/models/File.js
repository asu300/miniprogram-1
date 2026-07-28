const { mongoose } = require('../db');

const fileSchema = new mongoose.Schema({
  name: String,
  fileID: String,
  category: String,
  isImage: Boolean,
  createTime: Date,
  fileSize: Number,
  isTop: { type: Boolean, default: false },
  topOrder: { type: Number, default: 0 },
});

module.exports = mongoose.model('File', fileSchema);
