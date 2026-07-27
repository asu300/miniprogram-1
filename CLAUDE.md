# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

微信云开发文件资料管理小程序，服务于航空运营"四分部"，用于按航线和类别组织、上传、预览各类运营文件。基于微信官方 quickstart-wx-cloud 模板定制。

- **AppID**: `wx2271e101fb205dfe`
- **云开发环境**: `cloud1-3ggl1ttiaa22fb3e`（硬编码在 `miniprogram/app.js`）
- **基础库**: 3.14.2，原生小程序开发（WXML + WXSS + JS），无 Taro/uni-app

## 运行方式

在微信开发者工具中打开项目根目录，点击编译即可预览。无命令行构建流程。

部署云函数：在开发者工具中右键 `cloudfunctions/` 下对应目录 → "上传并部署"。

## 架构说明

### 页面结构（5 个活跃页面）

- `pages/index/` — 首页：9 个分类卡片（scroll-view 横向分页）、全局搜索栏、上传入口、航空英语入口
- `pages/list/` — 文件列表：核心业务页，按分类展示文件，支持预览/置顶/重命名/删除/音频播放
- `pages/upload/` — 上传页：单文件/多文件/图片上传，分类选择
- `pages/exercise/` — 航空英语练习列表
- `pages/exerciseDetail/` — 练习详情：播放音频 + 模板学习 + 填空练习

`pages/example/` 是 quickstart 模板遗留页面，未注册到 app.json。

### 业务分类

9 个分类常量 `CATEGORY_MAP` 在 `index.js` 和 `list.js` 中各有一份（非模块化，需同步修改）：

```
recent_announcement, zhengzhou_jinai, zhengzhou_delhi, zhengzhou_liege,
zhengzhou_budapest, zhengzhou_bangalore, b747_ops, other_important, media_resources
```

上传页 `upload.js` 中的 `categoryNames` / `categoryKeys` 数组也需要同步维护。

### 数据库

集合 `files`，字段：`name`, `fileID`, `category`, `isImage`, `createTime`, `fileSize`, `isTop`, `topOrder`。

集合 `exercises`，字段：`title`, `fileID`, `category`, `template`, `blanks`(数组, 每项含 `answer`/`hint`), `difficulty`, `createTime`。

所有数据库操作在客户端直接调用 `wx.cloud.database()`，不经过云函数。权限需设为"所有用户可读写"。

### 云函数

- `quickstartFunctions` — quickstart 模板示例（CRUD），业务页面未使用
- `setFilePublic` — 将云存储文件设为公开只读权限

### 样式约定

- 主题色 `#1a73e8`，卡片白底 + 圆角 18rpx + 轻阴影
- 全局 `.container` 在 `app.wxss` 中设了 `display: flex; align-items: center`，首页通过 `index.wxss` 覆盖为 `display: block`
- 按钮默认样式在 `app.wxss` 中被重置（`background: initial`）
- 单位统一使用 `rpx`

### 管理模式

连续点击列表页标题 3 次 → 弹出密码框 → 输入 `0000` 启用管理员模式（置顶/重命名/删除）。

## Mini PC（远端 Windows 执行机）

用于处理 AI 知识库文本提取等重任务，避免云函数 256MB 内存限制。

### 通信方式
- **GitHub 中转**：我向仓库推送 `triggers/run.txt`，Mini PC 定时任务拉取后执行
- **微信后备**：Mini PC 上有微信，可通过用户转发消息

### Mini PC 信息
- **系统**：Windows
- **项目路径**：`D:\docproc`（克隆自本仓库）
- **看门狗脚本**：`scripts/minipc-watch.js`（定时任务运行，每 5 分钟 git pull 检查指令）
- **处理脚本**：`scripts/process-pending.js`（下载 → 提取文本 → 分块 → 写回 doc_chunks）
- **依赖**：`npm install @cloudbase/node-sdk mammoth pdf-parse`

### 指令格式
写入 `triggers/run.txt` 的内容：
- `process-pending` — 处理待提取文件
- `exec: node scripts/xxx.js` — 执行任意脚本
- `shell: <命令>` — 执行 shell 命令
