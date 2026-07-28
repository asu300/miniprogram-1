/**
 * 从 cloudfunctions/difyProxy/index.js 移植
 * 改动: 云数据库 → Mongoose, 入口改为 Express route
 */
const express = require('express');
const https = require('https');
const DocChunk = require('../models/DocChunk');
const router = express.Router();

// ===== 配置 =====
const DEEPSEEK_API_KEY = 'sk-f27ac80444214044a1c2a59a2708ca35';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const MAX_CHUNKS = 20;
const CHUNK_MATCH_THRESHOLD = 1;
const SEARCH_LIMIT = 30;
const TIMEOUT = 20000;

const CATEGORY_NAMES = {
  recent_announcement: '飞行部重要宣贯（近期通知、风险提示、安全通告）',
  zhengzhou_jinai: '郑州→金奈航线文件',
  zhengzhou_delhi: '郑州→德里航线文件',
  zhengzhou_liege: '郑州→列日航线文件',
  zhengzhou_budapest: '郑州→布达佩斯航线文件',
  zhengzhou_bangalore: '郑州→班加罗尔航线文件',
  zhengzhou_north_america: '郑州→北美航线文件',
  b747_ops: 'B747 手册',
  other_important: '其它重要资料',
  media_resources: '音视频资料',
};

const TIME_WORDS = ['最近', '最新', '近期', '新发布', '新', '近期内', 'recent', 'latest', 'new', '近'];

const CATEGORY_ALIASES = {
  '飞行部': 'recent_announcement',
  '宣贯': 'recent_announcement',
  '飞行部重要宣贯': 'recent_announcement',
  '近期通知': 'recent_announcement',
  '风险提示': 'recent_announcement',
  '安全通告': 'recent_announcement',
  '金奈': 'zhengzhou_jinai',
  '德里': 'zhengzhou_delhi',
  '列日': 'zhengzhou_liege',
  '布达佩斯': 'zhengzhou_budapest',
  '班加罗尔': 'zhengzhou_bangalore',
  '北美': 'zhengzhou_north_america',
  'b747': 'b747_ops',
  '手册': 'b747_ops',
  '操作手册': 'b747_ops',
  '重要资料': 'other_important',
  '音视频': 'media_resources',
};

const AV_DICT = [
  '波音', '空客', '747', '737', '767', '777', '787',
  '飞机', '航空', '飞行', '航班', '航线', '航路', '机场', '跑道',
  '驾驶舱', '客舱', '货舱', '起落架', '发动机', '引擎', '机翼',
  '尾翼', '襟翼', '方向舵', '升降舵', '副翼',
  '起飞', '降落', '巡航', '爬升', '下降', '滑行', '进近', '离场',
  '航程', '速度', '高度', '马赫', '海里', '英尺',
  '长宽高', '翼展', '机长', '机高', '载重', '载客', '燃油', '油量',
  '最大起飞重量', '空重', '商载', '升限',
  '飞行部', '宣贯', '重要宣贯', '飞行部重要宣贯',
  '风险提示', '安全通告', '通知',
  '机务', '签派', '乘务', '安保',
  '郑州', '金奈', '德里', '列日', '布达佩斯', '班加罗尔', '北美',
  '操作', '维护', '检查', '维修', '保养', '更换', '安装', '拆卸', '测试',
  '长度', '宽度', '高度', '重量', '体积', '容量', '压力', '温度',
  '培训', '考核', '资格', '执照',
];

const SYNONYM_MAP = {
  '747': ['b747', 'boeing747', '波音747'],
  'b747': ['747', 'boeing747', '波音747'],
  '737': ['b737', 'boeing737', '波音737'],
  '777': ['b777', 'boeing777', '波音777'],
  '787': ['b787', 'boeing787', '波音787'],
  '长宽高': ['尺寸', '外形尺寸', '规格'],
  '尺寸': ['长宽高', '外形尺寸', '规格'],
  '航程': ['续航', '飞行距离', '最大航程'],
  '引擎': ['发动机'],
  '发动机': ['引擎'],
  '燃油': ['油量', '燃料', '加油量'],
  '速度': ['时速', '速率', '速度范围'],
  '重量': ['载重', '重量限制', '最大重量'],
  '翼展': ['机翼宽度', '翼宽'],
  '起飞': ['起降', '起飞性能'],
  '降落': ['着陆', '着陆性能'],
  '维护': ['保养', '检修', '维修'],
  '维修': ['维护', '检修', '保养'],
  '安全': ['安保', '安全措施', '安全须知'],
  '紧急': ['应急', '紧急情况', '应急程序'],
  '手册': ['指南', '操作手册', '使用手册'],
};

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

function segmentChinese(text) {
  const result = [];
  let i = 0;
  while (i < text.length) {
    let found = false;
    for (let len = Math.min(12, text.length - i); len >= 2; len--) {
      const w = text.substring(i, i + len);
      if (AV_DICT.includes(w)) { result.push(w); i += len; found = true; break; }
    }
    if (!found) i++;
  }
  return result;
}

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

  for (const w of text.match(/[a-zA-Z]+/g) || []) { if (w.length >= 2) add(w); }
  for (const w of text.match(/\d{3,}/g) || []) { add(w); }

  const chineseChars = text.match(/[一-鿿]/g) || [];
  const rawChinese = chineseChars.join('');
  if (rawChinese.length >= 2) add(rawChinese);
  for (let i = 0; i < rawChinese.length - 1; i++) add(rawChinese.substring(i, i + 2));
  for (let i = 0; i < rawChinese.length - 2; i++) add(rawChinese.substring(i, i + 3));
  for (const w of segmentChinese(rawChinese)) add(w);

  for (const seg of text.split(/[，。、；：？！\s,.;:?!]+/)) {
    if (seg.length >= 2 && /[一-鿿]/.test(seg)) add(seg);
  }

  for (const kw of result) {
    const syns = SYNONYM_MAP[kw];
    if (syns) for (const syn of syns) add(syn);
  }

  result.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return result.slice(0, 15);
}

async function searchChunks(keywords) {
  if (!keywords.length) return [];

  // ponytail: 顺序搜索而非并行，避免 MongoDB 连接风暴；数据量小影响不大
  const chunkMap = new Map();

  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const catKey = CATEGORY_ALIASES[kw];

    try {
      let docs;
      if (catKey) {
        docs = await DocChunk.find({ category: catKey }).limit(SEARCH_LIMIT * 3).lean();
      } else {
        const regex = new RegExp(escaped, 'i');
        docs = await DocChunk.find({
          $or: [{ content: regex }, { fileName: regex }]
        }).limit(SEARCH_LIMIT).lean();
      }

      for (const doc of docs) {
        const existing = chunkMap.get(doc._id.toString());
        if (existing) { existing.score++; }
        else { chunkMap.set(doc._id.toString(), { doc, score: 1 }); }
      }
    } catch (e) {
      console.error(`[关键词搜索错误] ${kw}:`, e.message);
    }
  }

  return Array.from(chunkMap.values())
    .filter(item => item.score >= CHUNK_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CHUNKS)
    .map(item => item.doc);
}

function callDeepSeek(query, context) {
  const catDesc = Object.entries(CATEGORY_NAMES).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const systemPrompt = `你是一个航空运营文件助手。根据提供的文档内容回答问题。

文档分类说明：
${catDesc}

规则：
1. 仅基于上方"相关文档内容"回答，不要编造信息
2. 如果文档内容不足以回答问题，请明确说"文档中没有相关信息"
3. 引用格式：在引用处用 [N] 标记，N 为来源编号（例如 "根据[1]，飞行前需..."）。N 必须来自上面提供的来源编号
4. 禁止引用未在上方文档列表中出现的文件
5. 如果问题提到"最近""最新"等，优先引用创建时间较新的文档
6. 如果问题涉及某个分类（如飞行部宣贯），优先引用该分类下的文档
7. 用中文回答
8. 如果用户问"XX分类有哪些""有什么内容"等，不要只列文件名，要阅读文件内容后总结各文件的核心要点
9. 回答应简洁、准确、专业`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `以下是相关文档内容：\n\n${context}\n\n---\n\n问题：${query}` },
  ];

  const body = JSON.stringify({
    model: 'deepseek-v4-flash',
    messages,
    temperature: 0.1,
    max_tokens: 2048,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(DEEPSEEK_URL);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(`DeepSeek API 错误: ${parsed.error.message || parsed.error.code}`));
          else resolve(parsed.choices?.[0]?.message?.content || '');
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

// POST /api/chat
router.post('/', async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.json({ answer: '请输入问题' });
  }

  console.log(`[RAG 查询] query=${query}`);

  try {
    const keywords = extractKeywords(query);
    console.log(`  关键词: ${keywords.join(', ')}`);

    if (!keywords.length) {
      return res.json({ answer: '请提出更具体的问题，以便搜索相关文档。' });
    }

    let chunks = await searchChunks(keywords);
    console.log(`  找到 ${chunks.length} 个相关片段`);

    if (!chunks.length) {
      return res.json({ answer: '文档库中未找到与您问题相关的信息。' });
    }

    const isTimeQuery = TIME_WORDS.some(tw => query.includes(tw));
    if (isTimeQuery) {
      chunks.sort((a, b) => {
        const tA = a.createTime ? new Date(a.createTime).getTime() : 0;
        const tB = b.createTime ? new Date(b.createTime).getTime() : 0;
        return tB - tA;
      });
    }

    const seenIds = new Set();
    const uniqueChunks = chunks.filter(c => {
      if (seenIds.has(c.fileID)) return false;
      seenIds.add(c.fileID);
      return true;
    });

    const sources = [];
    const context = uniqueChunks.map((c, i) => {
      const catName = CATEGORY_NAMES[c.category] || c.category || '未分类';
      sources.push({ name: c.fileName, fileId: c.fileID, category: c.category || '' });
      return `[来源 ${i + 1}] ${c.fileName}（分类：${catName}）\n${(c.content || '').slice(0, 1000)}`;
    }).join('\n\n---\n\n');

    let answer = await callDeepSeek(query, context);

    const maxN = sources.length;
    answer = answer.replace(/\[(\d+)\]/g, (match, n) => {
      const idx = parseInt(n, 10);
      return (idx >= 1 && idx <= maxN) ? match : '';
    });

    const citedNums = new Set(
      [...answer.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10))
    );
    const filteredSources = sources.filter((_, i) => citedNums.has(i + 1));

    res.json({ answer, sources: filteredSources.length ? filteredSources : sources });
  } catch (err) {
    console.error('[RAG 错误]', err.message);
    res.json({ error: 'AI 服务暂不可用，请稍后再试' });
  }
});

module.exports = router;
