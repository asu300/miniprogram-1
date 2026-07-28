/**
 * Mini PC 安装 natapp 内网穿透
 * 用法: node scripts/setup-natapp.js <你的authtoken>
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const ROOT_DIR = path.join(__dirname, '..');
const NATAPP_DIR = path.join(ROOT_DIR, 'natapp');
const AUTHT_TOKEN = process.argv[2];

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 60000, cwd: NATAPP_DIR }).trim(); }
  catch (e) { return e.stdout?.trim() || e.message; }
}

async function main() {
  if (!AUTHT_TOKEN) {
    console.error('请提供 authtoken: node scripts/setup-natapp.js <你的token>');
    process.exit(1);
  }

  if (!fs.existsSync(NATAPP_DIR)) fs.mkdirSync(NATAPP_DIR, { recursive: true });

  // 下载 natapp Windows 客户端
  const exePath = path.join(NATAPP_DIR, 'natapp.exe');
  if (!fs.existsSync(exePath)) {
    console.log('[NATAPP] 下载客户端...');
    const zipPath = path.join(NATAPP_DIR, 'natapp.zip');
    execSync('curl -L -o "' + zipPath + '" https://cdn.natapp.cn/assets/downloads/client/natapp_win_amd64.zip', { shell: true, timeout: 120000 });
    // Windows 解压
    execSync('powershell Expand-Archive -Path "' + zipPath + '" -DestinationPath "' + NATAPP_DIR + '" -Force', { shell: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    console.log('[NATAPP] 下载完成');
  }

  // 写配置文件
  const configPath = path.join(NATAPP_DIR, 'config.ini');
  fs.writeFileSync(configPath, `[default]
authtoken=${AUTHT_TOKEN}
clienttoken=
log=none
loglevel=none
http_proxy=
`, 'utf8');

  console.log('[NATAPP] ✅ 配置完成');
  console.log('[NATAPP] 在 Mini PC 上运行:');
  console.log(`  cd ${NATAPP_DIR} && natapp.exe`);
  console.log('[NATAPP] 启动后会显示公网 URL，例如 http://xxx.natapp.cc');
  console.log('[NATAPP] 然后修改前端 api.js 中的 LOCAL_SERVER 为该 URL');
}

main().catch(e => console.error('[NATAPP] 错误:', e.message));
