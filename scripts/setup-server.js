/**
 * Mini PC 后端服务搭建脚本
 * 被 minipc-watch.js 通过 triggers/run.txt 触发
 */
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const SERVER_DIR = path.join(__dirname, '..', 'server');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: SERVER_DIR, encoding: 'utf8', timeout: 120000, ...opts }).trim();
  } catch (e) {
    return e.stdout?.trim() || e.message;
  }
}

function runWithOutput(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 120000, stdio: 'inherit', ...opts });
  } catch (e) {
    return e.stdout?.trim() || e.message;
  }
}

// ─── MongoDB 自动安装（Windows）─────────────────────────────────
function checkMongo() {
  try {
    execSync('mongosh --eval "db.version()" --quiet 2>&1 || mongo --eval "db.version()" --quiet 2>&1', { timeout: 5000, encoding: 'utf8' });
    return true;
  } catch { return false; }
}

function installMongo() {
  console.log('[Setup] 尝试自动安装 MongoDB...');

  // 方法1: winget（Windows 10/11 自带）
  console.log('[Setup]  尝试 winget...');
  try {
    run('winget install --silent MongoDB.Server', { shell: true });
    // 等待服务启动
    for (let i = 0; i < 12; i++) {
      execSync('timeout /t 5 /nobreak >nul', { shell: true });
      if (checkMongo()) { console.log('[Setup]  ✅ MongoDB 安装成功 (winget)'); return true; }
    }
  } catch { console.log('[Setup]   winget 未成功，尝试下一个方法...'); }

  // 方法2: 直接下载 MSI 静默安装
  console.log('[Setup]  尝试下载 MongoDB MSI...');
  const msiUrl = 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.1-signed.msi';
  const msiPath = path.join(__dirname, '..', 'mongodb-installer.msi');

  try {
    // 下载
    console.log('[Setup]   下载中（约 500MB，可能需要几分钟）...');
    const msiFile = fs.createWriteStream(msiPath);
    spawn('curl', ['-L', '--progress-bar', '-o', msiPath, msiUrl], { shell: true, stdio: 'inherit' });

    // 静默安装
    console.log('[Setup]   安装中...');
    run(`msiexec /i "${msiPath}" /qn /norestart ADDLOCAL="ServerService" SHOULD_INSTALL_COMPASS="0"`, { shell: true });

    // 等 MongoDB 服务启动
    for (let i = 0; i < 12; i++) {
      execSync('timeout /t 5 /nobreak >nul', { shell: true });
      if (checkMongo()) { console.log('[Setup]  ✅ MongoDB 安装成功 (MSI)'); return true; }
    }
  } catch (e) {
    console.log('[Setup]   MSI 安装失败:', e.message);
  }

  return false;
}

// ─── Cloudflare Tunnel 自动安装 ──────────────────────────────────
function installCloudflared() {
  console.log('[Setup] 检查 Cloudflare Tunnel...');
  try {
    execSync('cloudflared --version 2>&1', { timeout: 5000, encoding: 'utf8' });
    console.log('[Setup]  ✅ cloudflared 已安装');
    return true;
  } catch {
    console.log('[Setup]   安装 cloudflared...');
    try {
      run('winget install --silent Cloudflare.cloudflared', { shell: true });
      console.log('[Setup]  ✅ cloudflared 安装完成');
      return true;
    } catch {
      console.log('[Setup]   cloudflared 安装失败，可后续手动安装');
      return false;
    }
  }
}

// ─── 主流程 ──────────────────────────────────────────────────────
async function main() {
  console.log('[Setup] ===== 开始搭建后端服务 =====\n');

  // 1. npm install
  console.log('[Setup] 安装依赖...');
  const installLog = run('npm install');
  console.log(installLog.slice(0, 300));

  // 2. MongoDB
  console.log('\n[Setup] 检查 MongoDB...');
  let mongoOk = checkMongo();
  if (!mongoOk) {
    mongoOk = installMongo();
  } else {
    console.log('[Setup]  ✅ MongoDB 已运行');
  }

  // 3. PM2
  console.log('\n[Setup] 安装 PM2...');
  try {
    execSync('npm install -g pm2', { encoding: 'utf8', timeout: 60000 });
    console.log('[Setup]  ✅ PM2 已安装');
  } catch {
    console.log('[Setup]  PM2 已存在');
  }

  // 4. 启动服务
  if (mongoOk) {
    console.log('\n[Setup] 启动服务...');
    run('npx pm2 delete aviation-api 2>nul || echo ok', { shell: true });
    const startLog = run('npx pm2 start app.js --name aviation-api -- --port 3000', { shell: true });
    console.log(startLog.slice(0, 500));
    run('npx pm2 save', { shell: true });
    try { run('npx pm2 startup', { shell: true }); } catch {}

    console.log('\n[Setup] ✅ 服务已启动');
    console.log('[Setup] ✅ 健康检查: http://localhost:3000/api/health');

    // 5. Cloudflare Tunnel（外网穿透）
    installCloudflared();
    console.log('\n[Setup] ⚡ 如需外网访问，请在 Mini PC 上运行:');
    console.log('  cloudflared tunnel create aviation-api');
    console.log('  cloudflared tunnel route dns aviation-api api.你的域名.com');
    console.log('  cloudflared tunnel run aviation-api');
  } else {
    console.log('\n[Setup] ❌ MongoDB 安装未成功，手动安装:');
    console.log('  1. 打开 https://www.mongodb.com/try/download/community');
    console.log('  2. 下载 Windows MSI，安装时勾选 "Install as Service"');
    console.log('  3. 装完执行: cd D:\\docproc\\server && npx pm2 start app.js --name aviation-api');
  }

  // 写结果
  const resultPath = path.join(__dirname, '..', 'triggers', 'result.txt');
  const status = mongoOk ? '完成' : '需要手动安装 MongoDB';
  fs.writeFileSync(resultPath, `状态: ${status}\n时间: ${new Date().toISOString()}\n\n后端服务搭建${mongoOk ? '完毕' : '暂停，待 MongoDB 手动安装'}`, 'utf8');
  console.log(`\n[Setup] 结果已写入 ${resultPath}`);
}

main().catch(e => console.error('[Setup] 错误:', e.message));
