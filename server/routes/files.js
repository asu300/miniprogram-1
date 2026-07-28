const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { files: Files } = require('../db');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

router.get('/', async (req, res) => {
  const { category } = req.query;
  try {
    const filter = category ? { category } : {};
    const docs = await Files.find(filter, { isTop: -1, topOrder: 1, createTime: -1 });
    res.json({ data: docs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/upload', upload.array('files'), async (req, res) => {
  const { category } = req.body;
  if (!req.files || !req.files.length) return res.status(400).json({ error: '未选择文件' });
  try {
    const docs = req.files.map(f => ({
      name: f.originalname,
      fileID: f.filename,
      category: category || 'other_important',
      isImage: /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f.originalname),
      createTime: new Date().toISOString(),
      fileSize: f.size,
      isTop: false,
      topOrder: 0,
    }));
    for (const doc of docs) await Files.insert(doc);
    res.json({ success: true, count: docs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/download/:id', async (req, res) => {
  try {
    const file = await Files.findOne({ _id: req.params.id });
    if (!file) return res.status(404).json({ error: '文件不存在' });
    res.download(path.join(UPLOAD_DIR, file.fileID), file.name);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
