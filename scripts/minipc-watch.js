/**
 * Mini PC 看门狗 — 检测 GitHub 触发指令，处理待提取文件
 *
 * 用法: node scripts/minipc-watch.js
 *
 * 流程:
 *   1. git pull
 *   2. 检查 triggers/run.txt
 *   3. 有指令 → 执行 process-pending.js
 *   4. 写结果到 triggers/result.txt
 *   5. git commit && git push
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RUN_FILE = path.join(__dirname, '..', 'triggers', 'run.txt');
const RESULT_FILE = path.join(__dirname, '..', 'triggers', 'result.txt');

function run(cmd) {
  try { return execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 120000 }).trim(); }
  catch (e) { return e.stdout?.trim() || e.message; }
}

async function main() {
  // 1. 拉取最新代码
  console.log('[看门狗] git pull...');
  run('git pull');

  // 2. 自动处理待提取文件（无人值守）
  console.log('[看门狗] 自动检查待处理文件...');
  let result = run('node scripts/process-pending.js');
  console.log(result);

  // 3. 检查是否有额外指令（wechat/exec/shell）
  if (fs.existsSync(RUN_FILE)) {
    const cmd = fs.readFileSync(RUN_FILE, 'utf8').trim();
    console.log('[看门狗] 指令:', cmd);

    if (cmd.startsWith('wechat:')) {
      const msg = cmd.slice(7).trim();
      console.log('[看门狗] 发微信:', msg);
      const https = require('https');
      const data = JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: { title: { tag: 'plain_text', content: '📡 主机消息' }, template: 'blue' },
          elements: [{ tag: 'markdown', content: msg }]
        }
      });
      const req = https.request({
        hostname: 'open.feishu.cn',
        path: '/open-apis/bot/v2/hook/de34c675-4511-4bf5-bd39-3fa7daea505e',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, res => { console.log('[看门狗] 飞书状态:', res.statusCode); });
      req.write(data); req.end();
      result += '\n已发送微信消息: ' + msg;
    } else if (cmd.startsWith('exec:')) {
      const script = cmd.slice(5).trim();
      console.log('[看门狗] 执行脚本:', script);
      result += '\n' + run(script);
    } else if (cmd.startsWith('shell:')) {
      const shellCmd = cmd.slice(6).trim();
      console.log('[看门狗] 执行命令:', shellCmd);
      result += '\n' + run(shellCmd);
    } else {
      result += '\n未知指令: ' + cmd;
    }

    // 删除指令文件
    fs.unlinkSync(RUN_FILE);
  }

  // 4. 写结果
  fs.writeFileSync(RESULT_FILE, `状态: 完成\n时间: ${new Date().toISOString()}\n\n${result}`);

  // 5. 推回结果
  run('git add triggers/');
  run('git commit -m "🔄 Mini PC: 处理完成"');
  const pushResult = run('git push');
  console.log('[看门狗] 推送结果:', pushResult.slice(0, 200));
  console.log('[看门狗] 完成');
}

main().catch(e => console.error('[看门狗] 错误:', e.message));
