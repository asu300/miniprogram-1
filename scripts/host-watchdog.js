/**
 * 主机看门狗 — 检测 Mini PC 返回的结果
 * 用法: node scripts/host-watchdog.js
 * 流程: git pull → 检查 triggers/result.txt → 有内容则飞书通知
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const RESULT_FILE = path.join(__dirname, '..', 'triggers', 'result.txt');
const LAST_SEEN = path.join(__dirname, '..', 'triggers', '.host_last_seen');

function run(cmd) {
  try { return execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 120000 }).trim(); }
  catch (e) { return e.stdout?.trim() || e.message; }
}

function sendFeishu(msg) {
  const data = JSON.stringify({
    msg_type: 'interactive',
    card: {
      header: { title: { tag: 'plain_text', content: '📡 Mini PC → 主机' }, template: 'green' },
      elements: [{ tag: 'markdown', content: msg }]
    }
  });
  const req = https.request({
    hostname: 'open.feishu.cn',
    path: '/open-apis/bot/v2/hook/de34c675-4511-4bf5-bd39-3fa7daea505e',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, res => { console.log('[主机看门狗] 飞书状态:', res.statusCode); });
  req.write(data); req.end();
}

async function main() {
  console.log('[主机看门狗] git pull...');
  run('git pull');

  if (!fs.existsSync(RESULT_FILE)) {
    console.log('[主机看门狗] 无结果，退出');
    return;
  }

  const content = fs.readFileSync(RESULT_FILE, 'utf8').trim();
  if (!content) { console.log('[主机看门狗] 结果为空，退出'); return; }

  // Check if already seen this result
  let lastContent = '';
  try { lastContent = fs.readFileSync(LAST_SEEN, 'utf8').trim(); } catch(e) {}

  if (content === lastContent) {
    console.log('[主机看门狗] 结果未变化，跳过');
    return;
  }

  // New result! Notify
  console.log('[主机看门狗] 新结果:', content.slice(0, 100));
  sendFeishu(content.slice(0, 500));

  // Mark as seen
  fs.writeFileSync(LAST_SEEN, content);
  console.log('[主机看门狗] 完成');
}

main().catch(e => console.error('[主机看门狗] 错误:', e.message));
