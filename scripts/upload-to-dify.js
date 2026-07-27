/**
 * 1. 登录 Dify Cloud 创建数据集 API Key
 * 2. 批量上传 D:/dify-import 里的文件到知识库
 *
 * 用法: node upload-to-dify.js
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const DIFY_CONSOLE = 'https://cloud.dify.ai';
const DIFY_API = 'https://api.dify.ai/v1';
const DATASET_ID = '8198db14-9cef-4685-a65f-7dc315ef323d';
const INPUT_DIR = 'D:/dify-import';

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

async function main() {
  // 从命令行参数获取邮箱密码
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('用法: node upload-to-dify.js <邮箱> <密码>');
    process.exit(1);
  }

  log('登录 Dify Cloud...');
  let loginRes;
  try {
    loginRes = await axios.post(`${DIFY_CONSOLE}/console/api/login`, {
      email, password: Buffer.from(password).toString('base64')
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    // 如果 base64 不行，试明文
    loginRes = await axios.post(`${DIFY_CONSOLE}/console/api/login`, {
      email, password
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cookies = loginRes.headers['set-cookie'] || [];
  const accessToken = cookies.find(c => c.startsWith('access_token='))?.split(';')[0]?.split('=')[1];
  const csrfToken = cookies.find(c => c.startsWith('csrf_token='))?.split(';')[0]?.split('=')[1];
  if (!accessToken) throw new Error('登录失败，请检查账号密码');

  log('✅ 登录成功');

  // 2. 创建数据集 API Key
  log('创建数据集 API Key...');
  const keyRes = await axios.post(
    `${DIFY_CONSOLE}/console/api/datasets/${DATASET_ID}/api-keys`,
    {},
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json',
        'Cookie': `access_token=${accessToken}; csrf_token=${csrfToken}`
      }
    }
  );
  const datasetKey = keyRes.data?.token || keyRes.data?.id || keyRes.data?.data?.token;
  if (!datasetKey) {
    // 可能是已有 Key，尝试获取已有的
    log('尝试获取已有 Key...');
    const listRes = await axios.get(
      `${DIFY_CONSOLE}/console/api/datasets/${DATASET_ID}/api-keys`,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Cookie': `access_token=${accessToken}; csrf_token=${csrfToken}` } }
    );
    const keys = listRes.data?.data || listRes.data;
    if (keys?.length > 0) {
      const key = keys[0].token || keys[0].id;
      log(`✅ 使用已有 Key: ${key.substring(0, 20)}...`);
      await uploadFiles(key);
    } else {
      throw new Error('创建 Key 失败');
    }
  } else {
    log(`✅ 已创建新 Key`);
    await uploadFiles(datasetKey);
  }
}

async function uploadFiles(apiKey) {
  const files = fs.readdirSync(INPUT_DIR).filter(f => {
    const ext = f.split('.').pop().toLowerCase();
    return !['mp3','m4a','wav','mp4','mov'].includes(ext);
  });
  log(`开始上传 ${files.length} 个文件到知识库...`);

  let success = 0, fail = 0;
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(INPUT_DIR, fileName);
    if (!fs.statSync(filePath).isFile()) continue;

    log(`[${i+1}/${files.length}] ${fileName}`);
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), fileName);
      form.append('data', JSON.stringify({
        name: fileName,
        indexing_technique: 'high_quality',
        process_rule: { mode: 'automatic' }
      }));

      await axios.post(`${DIFY_API}/datasets/${DATASET_ID}/document/create-by-file`, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${apiKey}`,
        },
        maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 120000,
      });
      log(`   ✅`);
      success++;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      log(`   ❌ ${msg}`);
      fail++;
    }
  }

  log(`\n完成！成功 ${success} 个，失败 ${fail} 个`);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
