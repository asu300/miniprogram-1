const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aviation';

let isConnected = false;

async function connect() {
  if (isConnected) return;
  await mongoose.connect(MONGO_URI);
  isConnected = true;
  console.log('[DB] MongoDB 已连接');
}

module.exports = { connect, mongoose };
