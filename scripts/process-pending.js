/**
 * 处理 doc_chunks 中待提取的记录（content 为空）
 * 从云存储下载文件 → 提取文本 → 分块 → 更新数据库
 *
 * 用法: node scripts/process-pending.js
 */
const cloudbase = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const CONFIG = {
  secretId: 'AKIDOzPbZAg06ynRtHVUXWP6h7kCRZjiV4Wu',
  secretKey: 'DLPOBj3MWbcXX6TM6eyEI7h3GHAsLZpu',
  envId: 'cloud1-3ggl1ttiaa22fb3e',
  chunkSize: 500,
  chunkOverlap: 50,
};

async function main() {
  const app = cloudbase.init({
    secretId: CONFIG.secretId,
    secretKey: CONFIG.secretKey,
    env: CONFIG.envId,
  });
  const db = app.database();

  // 找 content 为空的记录（按 fileName 去重）
  const pending = await db.collection('doc_chunks')
    .where({ content: '' })
    .limit(100)
    .get();

  const files = {};
  for (const r of pending.data) {
    if (!files[r.fileName] && r.fileID) files[r.fileName] = r.fileID;
  }

  console.log(`待处理文件: ${Object.keys(files).length}`);

  if (!fs.existsSync('/tmp/docproc')) fs.mkdirSync('/tmp/docproc', { recursive: true });

  for (const [fileName, fileID] of Object.entries(files)) {
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    if (!['pdf', 'docx', 'doc'].includes(ext)) continue;

    console.log(`\n处理: ${fileName}`);

    // 下载
    const tmp = path.join('/tmp/docproc', fileName);
    try {
      const res = await app.storage.downloadFile({ fileID, filePath: tmp });
      if (!res || !fs.existsSync(tmp)) { console.log(`  下载失败`); continue; }
    } catch (e) { console.log(`  下载失败: ${e.message}`); continue; }

    // 提取
    let text = '';
    try {
      if (ext === 'pdf') {
        text = (await pdfParse(fs.readFileSync(tmp))).text || '';
      } else if (ext === 'docx' || ext === 'doc') {
        text = (await mammoth.extractRawText({ path: tmp })).value || '';
      }
    } catch (e) { console.log(`  提取失败: ${e.message}`); continue; }

    text = text.trim();
    if (!text) { console.log(`  空内容`); continue; }

    // 分块
    const chunks = [];
    if (text.length <= CONFIG.chunkSize) {
      chunks.push(text);
    } else {
      let start = 0;
      while (start < text.length) {
        let end = start + CONFIG.chunkSize;
        if (end >= text.length) { chunks.push(text.slice(start)); break; }
        let split = text.lastIndexOf('\n', end);
        if (split <= start) split = text.lastIndexOf(' ', end);
        if (split <= start) split = end;
        chunks.push(text.slice(start, split));
        start = split - CONFIG.chunkOverlap;
      }
    }

    console.log(`  ${text.length} 字 → ${chunks.length} 片段`);

    // 获取旧记录中的 category
    const batch = db.collection('doc_chunks');
    const old = await batch.where({ fileName }).get();
    const category = old.data[0]?.category || '';

    // 删旧写新
    for (const r of old.data) {
      await batch.doc(r._id).remove().catch(() => {});
    }

    for (let i = 0; i < chunks.length; i++) {
      await batch.add({
        fileName, fileID,
        category,
        chunkIndex: i, totalChunks: chunks.length,
        content: chunks[i],
        fileType: ext,
        createTime: new Date(),
      });
    }
    console.log(`  ✅ 完成`);

    try { fs.unlinkSync(tmp); } catch (_) {}
  }

  console.log('\n全部完成');
}

main().catch(e => { console.error('异常:', e); process.exit(1); });
