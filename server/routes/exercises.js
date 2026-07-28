const express = require('express');
const { exercises: Exercises } = require('../db');
const router = express.Router();

// 查询练习列表（支持按 videoTitle 筛选）
router.get('/', async (req, res) => {
  const { videoTitle } = req.query;
  try {
    const filter = videoTitle ? { videoTitle } : {};
    const docs = await Exercises.find(filter, { createTime: videoTitle ? 1 : -1 });
    res.json({ data: docs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 按 ID 查单个练习
router.get('/detail', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: '缺少 id' });
  try {
    const doc = await Exercises.findOne({ _id: id });
    if (!doc) return res.status(404).json({ error: '练习不存在' });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
