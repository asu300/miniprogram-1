const express = require('express');
const cors = require('cors');
const { connect } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 公开路由
app.use('/api/auth', require('./routes/auth'));

// 需要登录的路由
app.use('/api/chat', require('./middleware/auth').authMiddleware, require('./routes/chat'));
app.use('/api/files', require('./middleware/auth').authMiddleware, require('./routes/files'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

connect().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] 四分部文件助手 运行在 http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('[Server] 启动失败:', err.message);
  process.exit(1);
});
