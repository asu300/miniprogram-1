/**
 * 从微信云开发导出数据到本地 NeDB
 * 被 minipc-watch.js 通过 triggers/run.txt 触发
 * 依赖: @cloudbase/node-sdk（process-pending.js 已装）
 */
const cloudbase = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'server', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG = {
  secretId: process.env.TCB_SECRET_ID || 'AKIDOzPbZAg06ynRtHVUXWP6h7kCRZjiV4Wu',
  secretKey: process.env.TCB_SECRET_KEY || 'DLPOBj3MWbcXX6TM6eyEI7h3GHAsLZpu',
  envId: process.env.TCB_ENV_ID || 'cloud1-3ggl1ttiaa22fb3e',
};

// NeDB 文件格式：每行一个 JSON 对象
function writeNeDB(filename, docs) {
  const filePath = path.join(DATA_DIR, filename);
  const lines = docs.map(d => JSON.stringify(d));
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  console.log(`  ✅ 写入 ${docs.length} 条 → ${filename}`);
}

async function main() {
  console.log('[Export] ===== 从云开发导出数据 =====\n');

  const app = cloudbase.init({
    secretId: CONFIG.secretId,
    secretKey: CONFIG.secretKey,
    env: CONFIG.envId,
  });
  const db = app.database();

  // 1. 导出 files
  console.log('[Export] 导出 files 集合...');
  let allFiles = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await db.collection('files').skip(offset).limit(limit).get();
    allFiles = allFiles.concat(res.data);
    if (res.data.length < limit) break;
    offset += limit;
  }
  writeNeDB('files.db', allFiles);

  // 2. 导出 doc_chunks
  console.log('[Export] 导出 doc_chunks 集合...');
  let allChunks = [];
  offset = 0;
  while (true) {
    const res = await db.collection('doc_chunks').skip(offset).limit(limit).get();
    allChunks = allChunks.concat(res.data);
    if (res.data.length < limit) break;
    offset += limit;
  }
  writeNeDB('doc_chunks.db', allChunks);

  // 写结果
  const resultPath = path.join(__dirname, '..', 'triggers', 'result.txt');
  fs.writeFileSync(resultPath,
    `状态: 完成\n时间: ${new Date().toISOString()}\n\n` +
    `files: ${allFiles.length} 条\n` +
    `doc_chunks: ${allChunks.length} 条\n` +
    `已写入 server/data/`, 'utf8');

  console.log(`\n[Export] ✅ 完成: files=${allFiles.length}, doc_chunks=${allChunks.length}`);
}

main().catch(e => {
  console.error('[Export] 错误:', e.message);
  const resultPath = path.join(__dirname, '..', 'triggers', 'result.txt');
  fs.writeFileSync(resultPath, `状态: 失败\n时间: ${new Date().toISOString()}\n\n${e.message}`, 'utf8');
});
