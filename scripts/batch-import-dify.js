/**
 * 批量导入云存储文件到 Dify 知识库
 * 在 Mini PC 上运行：node scripts/batch-import-dify.js
 */
const cloudbase = require('@cloudbase/node-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ===== 配置 =====
const CONFIG = {
  secretId: 'AKIDOzPbZAg06ynRtHVUXWP6h7kCRZjiV4Wu',
  secretKey: 'DLPOBj3MWbcXX6TM6eyEI7h3GHAsLZpu',
  envId: 'cloud1-3ggl1ttiaa22fb3e',
  difyApiKey: 'app-gAIsztelnjkefXeE1gMAeQYe',
  difyDatasetId: '8198db14-9cef-4685-a65f-7dc315ef323d',
  difyBaseUrl: 'https://cloud.dify.ai/v1',
  tmpDir: path.join(__dirname, '../.tmp_import'),
  batchSize: 3,  // 每次处理3个文件
};

// ===== 工具函数 =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

// ===== 上传单个文件到 Dify =====
async function uploadToDify(filePath, fileName) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), fileName);
  form.append('data', JSON.stringify({
    name: fileName,
    indexing_technique: 'high_quality',
    process_rule: { mode: 'automatic' }
  }));

  const res = await axios.post(
    `${CONFIG.difyBaseUrl}/datasets/${CONFIG.difyDatasetId}/document/create-by-file`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${CONFIG.difyApiKey}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000,
    }
  );
  return res.data;
}

// ===== 主流程 =====
async function main() {
  log('🍵 初始化 TCB...');
  const app = cloudbase.init({
    secretId: CONFIG.secretId,
    secretKey: CONFIG.secretKey,
    env: CONFIG.envId,
  });
  const db = app.database();

  // 1. 查询所有文件
  log('📦 查询数据库...');
  let allFiles = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await db.collection('files').skip(offset).limit(limit).get();
    allFiles = allFiles.concat(res.data || []);
    if ((res.data || []).length < limit) break;
    offset += limit;
  }
  log(`📦 共 ${allFiles.length} 个文件`);

  // 2. 过滤不支持的文件类型
  const skipExts = ['mp3', 'm4a', 'wav', 'mp4', 'mov']; // 音视频 Dify 不支持
  const validFiles = allFiles.filter(f => {
    const ext = (f.name || '').split('.').pop().toLowerCase();
    if (skipExts.includes(ext)) { log(`⏭️ 跳过音视频: ${f.name}`); return false; }
    return true;
  });
  log(`📦 可导入 ${validFiles.length} 个文件`);

  // 3. 创建临时目录
  fs.mkdirSync(CONFIG.tmpDir, { recursive: true });

  // 4. 分批处理
  let success = 0, fail = 0;
  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    log(`[${i + 1}/${validFiles.length}] ${file.name}`);

    try {
      // 4a. 获取临时下载链接
      const urlRes = await app.getTempFileURL({
        fileList: [{ fileID: file.fileID, maxAge: 3600 }]
      });
      const tempUrl = urlRes?.fileList?.[0]?.tempFileURL;
      if (!tempUrl) throw new Error('获取下载链接失败');

      // 4b. 下载文件到本地
      const localPath = path.join(CONFIG.tmpDir, file.name);
      const dlRes = await axios({ method: 'GET', url: tempUrl, responseType: 'stream', timeout: 30000 });
      const writer = fs.createWriteStream(localPath);
      dlRes.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // 4c. 上传到 Dify
      await uploadToDify(localPath, file.name);
      log(`  ✅ 已导入`);

      // 4d. 删掉本地临时文件
      fs.unlinkSync(localPath);
      success++;

      // 每处理完一个停一下，避免 Dify 限流
      await sleep(500);
    } catch (err) {
      log(`  ❌ 失败: ${err.message}`);
      fail++;
    }
  }

  // 5. 清理临时目录
  try { fs.rmdirSync(CONFIG.tmpDir); } catch (e) {}

  log(`\n📊 导入完成！成功 ${success}，失败 ${fail}`);
}

main().catch(err => {
  console.error('❌ 脚本异常:', err);
  process.exit(1);
});
