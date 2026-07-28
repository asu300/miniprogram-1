const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

// 按分类查询文件列表
router.get('/', async (req, res) => {
  const { category } = req.query;
  const filter = category ? { category } : {};
  const files = await File.find(filter).sort({ isTop: -1, topOrder: 1, createTime: -1 }).lean();
  res.json({ data: files });
});

// 上传文件
router.post('/upload', upload.array('files'), async (req, res) => {
  const { category } = req.body;
  if (!req.files || !req.files.length) return res.status(400).json({ error: '未选择文件' });

  const docs = req.files.map(f => ({
    name: f.originalname,
    fileID: f.filename,           // 本地文件名
    category: category || 'other_important',
    isImage: /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f.originalname),
    createTime: new Date(),
    fileSize: f.size,
  }));

  await File.insertMany(docs);
  res.json({ success: true, count: docs.length });
});

// ponytail: 文件直接通过静态路径访问
router.get('/download/:id', async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).json({ error: '文件不存在' });
  res.download(path.join(UPLOAD_DIR, file.fileID), file.name);
});

module.exports = router;
