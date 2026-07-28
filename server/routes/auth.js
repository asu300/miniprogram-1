const express = require('express');
const { generateToken } = require('../middleware/auth');
const router = express.Router();

// ponytail: 内部使用，固定验证码 0000，后续接入短信
router.post('/login', (req, res) => {
  const { phone, code } = req.body;
  if (!phone) return res.status(400).json({ error: '请输入手机号' });
  if (code !== '0000') return res.status(403).json({ error: '验证码错误' });

  const token = generateToken({ phone, name: phone });
  res.json({ token, user: { phone } });
});

module.exports = router;
