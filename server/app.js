const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 公开路由
app.use('/api/auth', require('./routes/auth'));

// 需要登录的路由（仅 AI 聊天需要登录，文件/练习 GET 请求公开）
app.use('/api/chat', require('./middleware/auth').authMiddleware, require('./routes/chat'));
app.use('/api/files', require('./routes/files'));
app.use('/api/exercises', require('./routes/exercises'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`[Server] 四分部文件助手 运行在 http://localhost:${PORT}`);
});
