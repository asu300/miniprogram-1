const { mongoose } = require('../db');

const docChunkSchema = new mongoose.Schema({
  fileName: String,
  fileID: String,
  content: String,
  category: String,
  createTime: Date,
});

module.exports = mongoose.model('DocChunk', docChunkSchema);
