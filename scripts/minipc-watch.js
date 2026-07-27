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

  // 2. 检查是否有指令
  if (!fs.existsSync(RUN_FILE)) {
    console.log('[看门狗] 无指令，退出');
    return;
  }

  const cmd = fs.readFileSync(RUN_FILE, 'utf8').trim();
  console.log('[看门狗] 指令:', cmd);

  if (cmd === 'process-pending') {
    // 3. 执行处理
    console.log('[看门狗] 开始处理...');
    const result = run('node scripts/process-pending.js');
    console.log(result);

    // 4. 写结果
    fs.writeFileSync(RESULT_FILE, `状态: 完成\n时间: ${new Date().toISOString()}\n\n${result}`);
  }

  // 5. 删除指令，推回结果
  fs.unlinkSync(RUN_FILE);
  run('git add triggers/');
  run('git commit -m "🔄 Mini PC: 处理完成"');
  const pushResult = run('git push');
  console.log('[看门狗] 推送结果:', pushResult.slice(0, 200));
  console.log('[看门狗] 完成');
}

main().catch(e => console.error('[看门狗] 错误:', e.message));
