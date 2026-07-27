# Mini PC (Windows) 部署 Dify + Cloudflare Tunnel

## 第 1 步：安装 Docker Desktop

1. 下载 Docker Desktop: https://www.docker.com/products/docker-desktop/
2. 双击安装，重启电脑
3. 启动 Docker Desktop（任务栏会看到鲸鱼图标）
4. 确认可用：打开 PowerShell 或 Git Bash 运行 `docker --version`

## 第 2 步：部署 Dify

在 Mini PC 上打开终端（Git Bash 或 PowerShell），运行：

```bash
# 下载 Dify
git clone https://github.com/langgenius/dify.git
cd dify/docker

# 复制环境配置
cp .env.example .env

# 启动 Dify（首次会拉取镜像，需几分钟）
docker compose up -d
```

启动后访问 `http://localhost` 即可打开 Dify 界面。

## 第 3 步：首次设置（在 Mini PC 浏览器操作）

1. 浏览器打开 `http://localhost`，注册管理员账号
2. 右上角 **设置 → 模型供应商 → DeepSeek**
3. 填入你的 DeepSeek API Key（去 [platform.deepseek.com](https://platform.deepseek.com) 获取）
4. 启用 `deepseek-chat`（用于问答）和 `deepseek-text-embedding`（用于向量化）

## 第 4 步：创建知识库

1. **知识库 → 创建知识库**
2. 上传你的 PDF/Word 文件（直接从电脑拖拽上传）
3. 分块策略选默认即可，点"确认"
4. Dify 会自动解析和索引

## 第 5 步：创建 AI 应用

1. **工作室 → 创建应用 → 聊天助手**
2. 模型选 DeepSeek
3. 左侧 **上下文** 关联上一步的知识库
4. **提示词** 填写：

```
你是四分部资料库的 AI 助手，请基于提供的文档内容回答用户问题。
如果文档中没有相关信息，请如实告知，不要编造。
回答简洁准确，涉及专业术语时保留原文。
```

5. 点 **发布 → API 访问**，复制 **API Key**（格式 `app-xxx`）

---

## 第 6 步：安装 Cloudflare Tunnel（内网穿透）

**在 Mini PC 上安装 cloudflared：**

```bash
# 下载 cloudflared
curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe

# 移到 PATH 目录（方便全局使用）
mkdir -p /c/Users/你的用户名/bin
mv cloudflared.exe /c/Users/你的用户名/bin/cloudflared.exe

# 测试
cloudflared.exe --version
```

**启动隧道（先测试）：**

```bash
# 注意：Dify 启动后占用 80 端口，所以指向 localhost:80
cloudflared.exe tunnel --url http://localhost:80
```

会输出 `https://xxx.trycloudflare.com` 地址 —— **把这个地址记下来**，它就是外网可访问的地址。

要让隧道在后台一直运行：打开一个新终端窗口跑上面的命令即可，不要关。

## 第 7 步：配置云函数

回到本项目（微信小程序项目），打开 `cloudfunctions/difyProxy/index.js`：

```javascript
const DIFY_BASE_URL = 'https://xxx.trycloudflare.com';  // ← 上一步记下的地址
const DIFY_API_KEY = 'app-xxxxx...';                     // ← 第5步的 API Key
```

然后在微信开发者工具中：
1. 右键 `cloudfunctions/difyProxy` → **上传并部署**
2. 重新编译小程序
3. 首页会出现 **AI 问答** 入口

## 第 8 步：批量导入历史文件

**方法一（推荐）：** 在 Dify 知识库页面直接上传文件（拖拽即可）

**方法二（后续可以写脚本）：** 从云存储下载后通过 Dify API 自动导入

---

## 常见问题

**Q: Docker 启动后访问 localhost 没反应？**
A: Dify 启动需要几分钟，运行 `docker compose ps` 确认所有容器都是 `Up` 状态。

**Q: Cloudflare Tunnel 报错？**
A: 确保 Dify 先启动成功（能访问 `http://localhost`）。如果端口冲突，可改 Dify 端口。

**Q: DeepSeek API Key 在哪获取？**
A: https://platform.deepseek.com 注册 → API Keys → 创建 API Key
