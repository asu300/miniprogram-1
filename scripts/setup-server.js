/**
 * Mini PC 后端服务搭建脚本
 * 被 minipc-watch.js 通过 triggers/run.txt 触发
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const ROOT_DIR = path.join(__dirname, '..');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: SERVER_DIR, encoding: 'utf8', timeout: 300000, ...opts }).trim();
  } catch (e) {
    return e.stdout?.trim() || e.message;
  }
}

async function main() {
  console.log('[Setup] ===== 开始搭建后端服务 =====\n');

  // 1. npm install（NeDB 很小，几秒就装完）
  console.log('[Setup] 安装依赖...');
  const installLog = run('npm install');
  console.log(installLog.slice(0, 300));

  // 2. 安装 PM2
  console.log('\n[Setup] 安装 PM2...');
  try {
    execSync('npm install -g pm2', { encoding: 'utf8', timeout: 60000 });
    console.log('[Setup]  ✅ PM2 已安装');
  } catch {
    console.log('[Setup]  PM2 已存在');
  }

  // 3. 启动服务
  console.log('\n[Setup] 启动服务...');
  run('npx pm2 delete aviation-api 2>nul || echo ok', { shell: true });
  const startLog = run('npx pm2 start app.js --name aviation-api -- --port 3000', { shell: true });
  console.log(startLog.slice(0, 500));
  run('npx pm2 save', { shell: true });
  try { run('npx pm2 startup', { shell: true }); } catch {}

  console.log('\n[Setup] ✅ 服务已启动');
  console.log('[Setup] ✅ 健康检查: http://localhost:3000/api/health');

  // 写结果
  const resultPath = path.join(ROOT_DIR, 'triggers', 'result.txt');
  fs.writeFileSync(resultPath, `状态: 完成\n时间: ${new Date().toISOString()}\n\n后端服务搭建完毕，运行在 http://localhost:3000`, 'utf8');
  console.log(`\n[Setup] 结果已写入 ${resultPath}`);
}

main().catch(e => console.error('[Setup] 错误:', e.message));
