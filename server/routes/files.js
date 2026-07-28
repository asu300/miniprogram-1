const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { files: Files } = require('../db');
const auth = require('../middleware/auth').authMiddleware;
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

// 按分类查询文件列表（分批加载）
router.get('/', async (req, res) => {
  const { category } = req.query;
  try {
    const filter = category ? { category } : {};
    const docs = await Files.find(filter, { isTop: -1, topOrder: 1, createTime: -1 });
    res.json({ data: docs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 搜索文件
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ data: [] });
  try {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const docs = await Files.find({ name: regex }, { createTime: -1 }, 50);
    res.json({ data: docs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 按文件名精确查找
router.get('/find', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.json(null);
  try {
    const doc = await Files.findOne({ name });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 上传文件
router.post('/upload', auth, upload.array('files'), async (req, res) => {
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 更新文件（置顶/重命名）
router.put('/:id', auth, async (req, res) => {
  try {
    const { isTop, topOrder, name } = req.body;
    const update = {};
    if (isTop !== undefined) update.isTop = isTop;
    if (topOrder !== undefined) update.topOrder = topOrder;
    if (name !== undefined) update.name = name;
    await Files.update({ _id: req.params.id }, { $set: update });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除文件
router.delete('/:id', auth, async (req, res) => {
  try {
    const doc = await Files.findOne({ _id: req.params.id });
    if (!doc) return res.status(404).json({ error: '文件不存在' });

    // 删除本地文件
    const filePath = path.join(UPLOAD_DIR, doc.fileID);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await Files.remove({ _id: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 下载/预览文件
router.get('/download/:id', async (req, res) => {
  try {
    const doc = await Files.findOne({ _id: req.params.id });
    if (!doc) return res.status(404).json({ error: '文件不存在' });

    const filePath = path.join(UPLOAD_DIR, doc.fileID);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件未找到' });
    res.download(filePath, doc.name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
