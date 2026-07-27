/**
 * RAG 云函数 — 搜索文档片段 + 调用 DeepSeek 回答
 *
 * 调用: wx.cloud.callFunction({ name:'difyProxy', data:{ query } })
 *
 * 环境变量:
 *   DEEPSEEK_API_KEY  (可在云函数中硬编码或通过 wx-server-sdk 获取)
 *
 * 部署前:
 *   1. 在 cloudfunctions/difyProxy/package.json 中加入 "wx-server-sdk"
 *   2. 右键 → 上传并部署
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const https = require('https');

// ===== 配置 =====
const DEEPSEEK_API_KEY = 'sk-f27ac80444214044a1c2a59a2708ca35';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const MAX_CHUNKS = 10;                // 最多取多少个相关片段
const CHUNK_MATCH_THRESHOLD = 1;      // 至少匹配几个关键词（≥1）
const SEARCH_LIMIT = 20;              // 每关键词取多少片段
const TIMEOUT = 20000;                // DeepSeek 请求超时 (ms)

// ─── 中文停用词 ──────────────────────────────────────────────────
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
  '之', '与', '及', '但', '或者', '因为', '所以', '如果', '虽然', '而',
  '其', '中', '等', '被', '把', '对', '从', '向', '在', '于', '让',
  '将', '并', '所', '为', '能', '吗', '吧', '呢', '啊', '哦', '呀',
  '什么', '怎么', '哪', '为什么', '如何', '怎样', '几', '多少',
  '这个', '那个', '这些', '那些', '这里', '那里', '哪些',
  '请', '问', '一下', '谢谢', '帮', '可以', '吗', '嘛',
  'what', 'how', 'why', 'when', 'where', 'which', 'who',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'this', 'that', 'these', 'those', 'it', 'its', 'and', 'or',
  'but', 'not', 'no', 'yes', 'please', 'tell', 'give',
]);

// ─── 关键词提取 ──────────────────────────────────────────────────

function extractKeywords(text) {
  const seen = new Set();
  const result = [];

  const add = (w) => {
    const lower = w.toLowerCase().trim();
    if (!lower || lower.length < 2) return;
    if (STOP_WORDS.has(lower)) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    result.push(lower);
  };

  // 1. English words (preserve multi-letter tokens)
  for (const w of text.match(/[a-zA-Z]+/g) || []) {
    if (w.length >= 2) add(w);
  }

  // 2. Chinese — keep original phrases (2+ chars)
  const chineseChars = text.match(/[一-鿿]/g) || [];
  const rawChinese = chineseChars.join('');

  // 2a. add the whole Chinese string if it's long enough
  if (rawChinese.length >= 2) add(rawChinese);

  // 2b. add all 2-grams (character bigrams) — catches individual terms
  for (let i = 0; i < rawChinese.length - 1; i++) {
    add(rawChinese.substring(i, i + 2));
  }

  // 3. Also try splitting by common Chinese punctuation
  for (const seg of text.split(/[，。、；：？！\s,.;:?!]+/)) {
    if (seg.length >= 2 && /[一-鿿]/.test(seg)) {
      add(seg);
    }
  }

  // 优先用更长的词（更精确）
  result.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return result.slice(0, 10);
}

// ─── 文档搜索 ────────────────────────────────────────────────────

async function searchChunks(keywords) {
  if (!keywords.length) return [];

  const chunkMap = new Map(); // _id -> { doc, score }

  const searches = keywords.map(async (kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = /[一-鿿]/.test(kw)
      ? escaped
      : `\\b${escaped}\\b`;

    try {
      const res = await db.collection('doc_chunks')
        .where({
          content: db.RegExp({
            regexp: pattern,
            options: 'i',
          }),
        })
        .limit(SEARCH_LIMIT)
        .get();
      return res.data || [];
    } catch (e) {
      console.error(`[关键词搜索错误] ${kw}:`, e.message);
      return [];
    }
  });

  const results = await Promise.all(searches);
  for (const docs of results) {
    for (const doc of docs) {
      const existing = chunkMap.get(doc._id);
      if (existing) {
        existing.score++;
      } else {
        chunkMap.set(doc._id, { doc, score: 1 });
      }
    }
  }

  // 按得分降序排列，取前 MAX_CHUNKS
  const ranked = Array.from(chunkMap.values())
    .filter(item => item.score >= CHUNK_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CHUNKS);

  return ranked.map(item => item.doc);
}

// ─── 补全缺失的 fileID ─────────────────────────────────────────────

async function fillFileIds(chunks) {
  const needLookup = chunks.filter(c => !c.fileID);
  if (!needLookup.length) return;

  for (const c of needLookup) {
    try {
      const res = await db.collection('files').where({ name: c.fileName }).limit(1).get();
      if (res.data.length) c.fileID = res.data[0].fileID;
    } catch (_) {}
  }
}

// ─── DeepSeek API ────────────────────────────────────────────────

function callDeepSeek(query, context) {
  const systemPrompt = `你是一个航空运营文件助手。根据提供的文档内容回答问题。

规则：
1. 仅基于上方"相关文档内容"回答，不要编造信息
2. 如果文档内容不足以回答问题，请明确说"文档中没有相关信息"
3. 引用格式：在引用处用 [N] 标记，N 为来源编号（例如 "根据[1]，飞行前需..."）。N 必须来自上面提供的来源编号
4. 禁止引用未在上方文档列表中出现的文件
5. 用中文回答
6. 回答应简洁、准确、专业`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `以下是相关文档内容：\n\n${context}\n\n---\n\n问题：${query}` },
  ];

  const body = JSON.stringify({
    model: 'deepseek-v4-flash',
    messages,
    temperature: 0.3,
    max_tokens: 2000,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(DEEPSEEK_URL);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`DeepSeek API 错误: ${parsed.error.message || parsed.error.code}`));
          } else {
            resolve(parsed.choices?.[0]?.message?.content || '');
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('DeepSeek 请求超时')); });
    req.write(body);
    req.end();
  });
}

// ─── 主入口 ──────────────────────────────────────────────────────

exports.main = async (event) => {
  const { query } = event;
  const wxContext = cloud.getWXContext();

  // ── 参数校验 ──
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { error: '请输入问题' };
  }

  // 检查 API Key
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-your-deepseek-api-key-here') {
    return { error: 'AI 服务未配置（缺少 DeepSeek API Key）' };
  }

  console.log(`[RAG 查询] user=${wxContext.OPENID} query=${query}`);

  try {
    // 1. 提取关键词
    const keywords = extractKeywords(query);
    console.log(`  关键词: ${keywords.join(', ')}`);

    if (keywords.length === 0) {
      return { answer: '请提出更具体的问题，以便搜索相关文档。' };
    }

    // 2. 搜索文档片段
    const chunks = await searchChunks(keywords);
    console.log(`  找到 ${chunks.length} 个相关片段`);

    // 补全缺失的 fileID
    await fillFileIds(chunks);

    if (chunks.length === 0) {
      return { answer: '文档库中未找到与您问题相关的信息。请尝试换个问法，或确认问题涉及的内容是否已上传到知识库。' };
    }

    // 3. 构建上下文
    const sources = [];
    const context = chunks.map((c, i) => {
      sources.push({ name: c.fileName, fileId: c.fileID, category: c.category || '' });
      return `[来源 ${i + 1}] ${c.fileName}\n${c.content.slice(0, 1000)}`;
    }).join('\n\n---\n\n');

    // 4. 调用 DeepSeek
    let answer = await callDeepSeek(query, context);

    // 5. 去重来源（按 fileId）
    const seen = new Set();
    const uniqueSources = sources.filter(s => {
      if (seen.has(s.fileId)) return false;
      seen.add(s.fileId);
      return true;
    });

    // 6. 验证引用编号：移除 answer 中越界的 [N]
    const maxN = uniqueSources.length;
    answer = answer.replace(/\[(\d+)\]/g, (match, n) => {
      const idx = parseInt(n, 10);
      return (idx >= 1 && idx <= maxN) ? match : '';
    });

    return { answer, sources: uniqueSources };
  } catch (err) {
    console.error('[RAG 错误]', err.message);
    return { error: 'AI 服务暂不可用，请稍后再试' };
  }
};
