const cloudbase = require('@cloudbase/node-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  secretId: 'AKIDOzPbZAg06ynRtHVUXWP6h7kCRZjiV4Wu',
  secretKey: 'DLPOBj3MWbcXX6TM6eyEI7h3GHAsLZpu',
  envId: 'cloud1-3ggl1ttiaa22fb3e',
  outputDir: 'D:/dify-import',
};

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  log('初始化 TCB...');
  const app = cloudbase.init({ secretId: CONFIG.secretId, secretKey: CONFIG.secretKey, env: CONFIG.envId });
  const db = app.database();

  log('查询数据库...');
  let allFiles = [], offset = 0;
  while (true) {
    const res = await db.collection('files').skip(offset).limit(100).get();
    allFiles = allFiles.concat(res.data || []);
    if ((res.data || []).length < 100) break;
    offset += 100;
  }
  log(`共 ${allFiles.length} 个文件`);

  const skipExts = ['mp3','m4a','wav','mp4','mov'];
  const validFiles = allFiles.filter(f =>
    !skipExts.includes((f.name||'').split('.').pop().toLowerCase())
  );
  log(`需下载 ${validFiles.length} 个文件（已跳过音视频）`);

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  let success = 0, fail = 0;

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    log(`[${i+1}/${validFiles.length}] ${file.name}`);
    try {
      const urlRes = await app.getTempFileURL({
        fileList: [{ fileID: file.fileID, maxAge: 7200 }]
      });
      const tempUrl = urlRes?.fileList?.[0]?.tempFileURL;
      if (!tempUrl) throw new Error('获取链接失败');

      const safeName = file.name.replace(/[<>:"/\\|?*]/g, '_');
      const localPath = path.join(CONFIG.outputDir, safeName);
      const dlRes = await axios({ method:'GET', url: tempUrl, responseType:'stream', timeout:60000 });
      const writer = fs.createWriteStream(localPath);
      dlRes.data.pipe(writer);
      await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
      log(`   ✅ (${(fs.statSync(localPath).size / 1024 / 1024).toFixed(1)}MB)`);
      success++;
      await sleep(300);
    } catch (err) {
      log(`   ❌ ${err.message}`);
      fail++;
    }
  }
  log(`\n完成！成功 ${success} 个，失败 ${fail} 个`);
  log(`文件保存在: ${CONFIG.outputDir}`);
}

main().catch(err => { console.error('异常:', err); process.exit(1); });
