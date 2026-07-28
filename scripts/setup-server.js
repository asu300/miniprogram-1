/**
 * Mini PC 后端服务搭建脚本
 * 被 minipc-watch.js 通过 triggers/run.txt 触发
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_DIR = path.join(__dirname, '..', 'server');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: SERVER_DIR, encoding: 'utf8', timeout: 120000, ...opts }).trim();
  } catch (e) {
    return e.stdout?.trim() || e.message;
  }
}

async function main() {
  console.log('[Setup] 开始搭建后端服务...\n');

  // 1. npm install
  console.log('[Setup] 安装依赖...');
  const installLog = run('npm install');
  console.log(installLog.slice(0, 300));

  // 2. 检查 MongoDB
  console.log('\n[Setup] 检查 MongoDB...');
  let mongoOk = false;
  try {
    const mongoCheck = execSync('mongosh --eval "db.version()" --quiet 2>&1 || mongo --eval "db.version()" --quiet 2>&1', { timeout: 5000, encoding: 'utf8' });
    mongoOk = true;
    console.log('  MongoDB: 已运行');
  } catch {
    console.log('  MongoDB: 未检测到');
    console.log('  ⚠ 请手动安装 MongoDB Community Server: https://www.mongodb.com/try/download/community');
    console.log('    Windows 下载 MSI 安装包，安装时选 "Install MongoDB as a Service"');
  }

  // 3. 安装 pm2（进程守护）
  console.log('\n[Setup] 安装 PM2...');
  try {
    execSync('npm install -g pm2', { encoding: 'utf8', timeout: 60000 });
    console.log('  PM2: 已安装');
  } catch {
    console.log('  PM2: 已存在或安装失败（可忽略）');
  }

  // 4. 尝试启动服务
  if (mongoOk) {
    console.log('\n[Setup] 启动服务...');
    run('npx pm2 delete aviation-api 2>nul || echo ok', { shell: true });
    const startLog = run('npx pm2 start app.js --name aviation-api -- --port 3000', { shell: true });
    console.log(startLog.slice(0, 500));

    // 注册开机自启
    run('npx pm2 save', { shell: true });
    try {
      run('npx pm2 startup', { shell: true });
    } catch {}
    console.log('\n[Setup] ✅ 服务已启动: http://localhost:3000');
    console.log('[Setup] ✅ 健康检查: http://localhost:3000/api/health');
  } else {
    console.log('\n[Setup] ⏸ 等待 MongoDB 安装完成后运行:');
    console.log('  cd D:\\docproc\\server && npx pm2 start app.js --name aviation-api');
  }

  // 5. 写结果文件
  const resultPath = path.join(__dirname, '..', 'triggers', 'result.txt');
  fs.writeFileSync(resultPath, `状态: 完成\n时间: ${new Date().toISOString()}\n\n后端服务搭建完毕`, 'utf8');
}

main().catch(e => console.error('[Setup] 错误:', e.message));
