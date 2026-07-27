/**
 * 本地 RAG — 提取文件文本 → 分段 → 上传到云数据库 doc_chunks
 *
 * 用法:
 *   node scripts/extract-and-upload.js                    # 全量处理
 *   node scripts/extract-and-upload.js --file "path.pdf"  # 追加单个文件
 *
 * 支持格式: pdf, docx, pptx, xlsx（图片自动跳过）
 */
const cloudbase = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const XLSX = require('xlsx');

const CONFIG = {
  secretId: 'AKIDOzPbZAg06ynRtHVUXWP6h7kCRZjiV4Wu',
  secretKey: 'DLPOBj3MWbcXX6TM6eyEI7h3GHAsLZpu',
  envId: 'cloud1-3ggl1ttiaa22fb3e',
  inputDir: 'D:/dify-import',
  chunkSize: 500,       // target chars per chunk
  chunkOverlap: 50,     // overlap between adjacent chunks
};

function log(m) { console.log(`[${new Date().toLocaleTimeString()}] ${m}`); }

// ─── Text Extractors ──────────────────────────────────────────────

async function extractPDF(filePath) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  return data.text || '';
}

async function extractDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || '';
}

async function extractPPTX(filePath) {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  let text = '';

  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();

  for (const sf of slideFiles) {
    const xml = await zip.files[sf].async('text');
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    for (const m of matches) {
      const t = m.replace(/<[^>]+>/g, '').trim();
      if (t) text += t + '\n';
    }
    text += '\n';
  }
  return text;
}

function extractXLSX(filePath) {
  const wb = XLSX.readFile(filePath);
  let text = '';
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.trim()) text += `【${name}】\n${csv}\n\n`;
  }
  return text;
}

// ─── Chunking ─────────────────────────────────────────────────────

function chunkText(text, fileName) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';

  for (const para of paragraphs) {
    if (!para) continue;
    if (cur.length + para.length > CONFIG.chunkSize && cur) {
      chunks.push(cur);
      cur = cur.slice(-CONFIG.chunkOverlap) + '\n' + para;
    } else {
      cur += (cur ? '\n' : '') + para;
    }
  }
  if (cur.trim()) chunks.push(cur);

  // If a single chunk is still too long, force-split by sentence
  const result = [];
  for (const c of chunks) {
    if (c.length > CONFIG.chunkSize * 1.5) {
      const sentences = c.split(/(?<=[。！？\n])/);
      let sub = '';
      for (const s of sentences) {
        if (sub.length + s.length > CONFIG.chunkSize && sub) {
          result.push(sub);
          sub = sub.slice(-CONFIG.chunkOverlap) + s;
        } else {
          sub += s;
        }
      }
      if (sub.trim()) result.push(sub);
    } else {
      result.push(c);
    }
  }

  return result;
}

// ─── 检查文件是否已存在 ─────────────────────────────────────────

async function isFileProcessed(db, fileName) {
  try {
    const r = await db.collection('doc_chunks')
      .where({ fileName })
      .limit(1)
      .get();
    return (r.data || []).length > 0;
  } catch {
    return false;
  }
}

// ─── 处理单个文件 ───────────────────────────────────────────────

async function processFile(db, filePath, fileName) {
  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']);

  if (IMAGE_EXTS.has(ext)) {
    log(`   ⏭️ 图片跳过`);
    return 'skip';
  }

  let text;
  if (ext === 'pdf') {
    text = await extractPDF(filePath);
  } else if (['docx', 'doc'].includes(ext)) {
    text = await extractDOCX(filePath);
  } else if (ext === 'pptx' || ext === 'ppt') {
    text = await extractPPTX(filePath);
  } else if (['xlsx', 'xls'].includes(ext)) {
    text = extractXLSX(filePath);
  } else {
    text = await extractPDF(filePath);
  }

  text = text.trim();
  if (!text) { log(`   ⏭️ 空内容`); return 'skip'; }

  const chunks = chunkText(text, fileName);
  log(`   ${text.length} 字 → ${chunks.length} 片段`);

  for (let j = 0; j < chunks.length; j++) {
    const doc = {
      fileName,
      chunkIndex: j,
      totalChunks: chunks.length,
      content: chunks[j],
      fileType: ext || 'unknown',
      createTime: new Date(),
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await db.collection('doc_chunks').add(doc);
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  return 'ok';
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const singleFile = process.argv.find(a => a.startsWith('--file='))
    ? process.argv.find(a => a.startsWith('--file=')).slice(7)
    : null;

  log('连接云数据库...');
  const app = cloudbase.init({
    secretId: CONFIG.secretId,
    secretKey: CONFIG.secretKey,
    env: CONFIG.envId,
  });
  const db = app.database();

  // 确保 doc_chunks 集合存在
  try {
    await db.createCollection('doc_chunks');
    log('创建 doc_chunks 集合成功');
  } catch (e) {
    if (e.code !== 'DATABASE_COLLECTION_ALREADY_EXIST') {
      log('创建集合警告: ' + e.message);
    }
  }

  // ── 单文件模式 ──
  if (singleFile) {
    const fileName = path.basename(singleFile);
    if (!fs.existsSync(singleFile)) {
      console.error(`文件不存在: ${singleFile}`);
      process.exit(1);
    }
    if (await isFileProcessed(db, fileName)) {
      log(`⏭️ "${fileName}" 已存在，跳过`);
      return;
    }
    log(`处理: ${fileName}`);
    const result = await processFile(db, singleFile, fileName);
    if (result === 'ok') {
      log('✅ 上传完成');
    }
    return;
  }

  // ── 全量模式 ──
  const files = fs.readdirSync(CONFIG.inputDir).filter(f =>
    fs.statSync(path.join(CONFIG.inputDir, f)).isFile()
  );
  log(`共 ${files.length} 个文件`);

  let totalChunks = 0, success = 0, fail = 0, skip = 0;

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(CONFIG.inputDir, fileName);

    log(`[${i + 1}/${files.length}] ${fileName}`);

    if (await isFileProcessed(db, fileName)) {
      log(`   ⏭️ 已存在，跳过`);
      skip++;
      continue;
    }

    try {
      const result = await processFile(db, filePath, fileName);
      if (result === 'ok') {
        totalChunks += 0; // count reported in processFile
        success++;
      } else {
        skip++;
      }
    } catch (err) {
      log(`   ❌ ${err.message}`);
      fail++;
    }
  }

  // 重新统计片段总数
  try {
    const c = await db.collection('doc_chunks').count();
    totalChunks = c.total;
  } catch {}

  log(`\n📊 完成！成功 ${success} 文件，共 ${totalChunks} 片段，失败 ${fail}，跳过 ${skip}`);
}

main().catch(err => { console.error('异常:', err); process.exit(1); });
