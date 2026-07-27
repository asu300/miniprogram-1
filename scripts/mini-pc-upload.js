/**
 * Mini PC 上运行：从云存储下载文件并上传到 Dify 知识库
 *
 * 用法: node mini-pc-upload.js <access_token>
 */
const cloudbase = require('@cloudbase/node-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ===== 配置 =====
const TCB_SECRET_ID = 'AKIDOzPbZAg06ynRtHVUXWP6h7kCRZjiV4Wu';
const TCB_SECRET_KEY = 'DLPOBj3MWbcXX6TM6eyEI7h3GHAsLZpu';
const TCB_ENV = 'cloud1-3ggl1ttiaa22fb3e';
const DATASET_ID = '8198db14-9cef-4685-a65f-7dc315ef323d';
const TMP_DIR = './dify_import_tmp';

function log(m) { console.log(`[${new Date().toLocaleTimeString()}] ${m}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const accessToken = process.argv[2];
  if (!accessToken) {
    console.error('用法: node mini-pc-upload.js <access_token>');
    process.exit(1);
  }

  // 1. 用 access_token 创建数据集 API Key
  log('创建数据集 API Key...');
  let datasetKey;
  try {
    const r = await axios.post(
      `https://cloud.dify.ai/console/api/datasets/${DATASET_ID}/api-keys`, {},
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Cookie': `access_token=${accessToken}` } }
    );
    datasetKey = r.data?.token;
    log('✅ 创建成功');
  } catch (e) {
    // 可能已有 Key，尝试获取
    try {
      const r = await axios.get(
        `https://cloud.dify.ai/console/api/datasets/${DATASET_ID}/api-keys`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Cookie': `access_token=${accessToken}` } }
      );
      const keys = r.data?.data || [];
      if (keys.length > 0) datasetKey = keys[0].token || keys[0].id;
    } catch (e2) {}
  }
  if (!datasetKey) {
    console.error('❌ 创建数据集 API Key 失败');
    process.exit(1);
  }
  log(`🔑 Key: ${datasetKey.substring(0, 20)}...`);

  // 2. 连接云存储下载文件
  log('连接云存储...');
  const app = cloudbase.init({ secretId: TCB_SECRET_ID, secretKey: TCB_SECRET_KEY, env: TCB_ENV });
  const db = app.database();

  log('查询文件列表...');
  let files = [], offset = 0;
  while (true) {
    const r = await db.collection('files').skip(offset).limit(100).get();
    files = files.concat(r.data || []);
    if ((r.data || []).length < 100) break;
    offset += 100;
  }

  const skipExts = ['mp3','m4a','wav','mp4','mov'];
  const valid = files.filter(f => !skipExts.includes((f.name||'').split('.').pop().toLowerCase()));
  log(`共 ${valid.length} 个文件待上传`);

  fs.mkdirSync(TMP_DIR, { recursive: true });
  let success = 0, fail = 0;

  for (let i = 0; i < valid.length; i++) {
    const file = valid[i];
    log(`[${i+1}/${valid.length}] ${file.name}`);

    try {
      // 下载
      const urlRes = await app.getTempFileURL({
        fileList: [{ fileID: file.fileID, maxAge: 3600 }]
      });
      const tempUrl = urlRes?.fileList?.[0]?.tempFileURL;
      if (!tempUrl) throw new Error('获取链接失败');

      const safeName = file.name.replace(/[<>:"/\\|?*]/g, '_');
      const localPath = path.join(TMP_DIR, safeName);
      const dl = await axios({ method:'GET', url: tempUrl, responseType:'stream', timeout:60000 });
      const writer = fs.createWriteStream(localPath);
      dl.data.pipe(writer);
      await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

      // 上传到 Dify
      const form = new FormData();
      form.append('file', fs.createReadStream(localPath), safeName);
      form.append('data', JSON.stringify({
        name: safeName,
        indexing_technique: 'high_quality',
        process_rule: { mode: 'automatic' }
      }));

      await axios.post(`https://api.dify.ai/v1/datasets/${DATASET_ID}/document/create-by-file`, form, {
        headers: { ...form.getHeaders(), 'Authorization': `Bearer ${datasetKey}` },
        maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 120000,
      });

      log(`   ✅`);
      fs.unlinkSync(localPath);
      success++;
      await sleep(500);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      log(`   ❌ ${msg}`);
      fail++;
    }
  }

  try { fs.rmdirSync(TMP_DIR); } catch(e) {}
  log(`\n📊 完成！成功 ${success} 个，失败 ${fail} 个`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
