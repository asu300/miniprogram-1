在 Mini PC 上依次运行以下命令：

# 1. 创建项目目录
mkdir -p ~/dify-import && cd ~/dify-import

# 2. 创建脚本文件
cat > batch-import.js << 'SCRIPT'
/**
 * 批量导入云存储文件到 Dify 知识库
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
  difyApiKey: 'app-Td7TLnTLGN6WzSFMcSaY8qDJ',
  difyDatasetId: '8198db14-9cef-4685-a65f-7dc315ef323d',
  difyBaseUrl: 'https://api.dify.ai/v1',
  tmpDir: './tmp_import',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

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
      headers: { ...form.getHeaders(), 'Authorization': `Bearer ${CONFIG.difyApiKey}` },
      maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 60000,
    }
  );
  return res.data;
}

async function main() {
  log('初始化 TCB...');
  const app = cloudbase.init({ secretId: CONFIG.secretId, secretKey: CONFIG.secretKey, env: CONFIG.envId });
  const db = app.database();

  log('查询数据库...');
  let allFiles = [];
  let offset = 0;
  while (true) {
    const res = await db.collection('files').skip(offset).limit(100).get();
    allFiles = allFiles.concat(res.data || []);
    if ((res.data || []).length < 100) break;
    offset += 100;
  }
  log(`共 ${allFiles.length} 个文件`);

  const skipExts = ['mp3','m4a','wav','mp4','mov'];
  const validFiles = allFiles.filter(f => {
    const ext = (f.name||'').split('.').pop().toLowerCase();
    if (skipExts.includes(ext)) { log(`跳过音视频: ${f.name}`); return false; }
    return true;
  });

  fs.mkdirSync(CONFIG.tmpDir, { recursive: true });
  let success = 0, fail = 0;

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    log(`[${i+1}/${validFiles.length}] ${file.name}`);
    try {
      const urlRes = await app.storage().getTempFileURL({
        fileList: [{ fileid: file.fileID, max_age: 3600 }]
      });
      const tempUrl = urlRes?.fileList?.[0]?.tempFileURL;
      if (!tempUrl) throw new Error('获取链接失败');

      const localPath = path.join(CONFIG.tmpDir, file.name);
      const dlRes = await axios({ method:'GET', url: tempUrl, responseType:'stream', timeout:30000 });
      const writer = fs.createWriteStream(localPath);
      dlRes.data.pipe(writer);
      await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

      await uploadToDify(localPath, file.name);
      log(`   ✅ 已导入`);
      fs.unlinkSync(localPath);
      success++;
      await sleep(500);
    } catch (err) {
      log(`   ❌ 失败: ${err.message}`);
      fail++;
    }
  }
  try { fs.rmdirSync(CONFIG.tmpDir); } catch(e) {}
  log(`\n完成！成功 ${success}，失败 ${fail}`);
}
main().catch(err => { console.error('异常:', err); process.exit(1); });
SCRIPT

# 3. 安装依赖
npm init -y
npm install @cloudbase/node-sdk axios form-data

# 4. 运行
node batch-import.js
