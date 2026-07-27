# 触发机制

通过 GitHub 仓库做我(Claude Code)和 Mini PC 之间的消息通道。

## 工作方式

1. **我** 向 `triggers/run.txt` 写入指令 → 推送到 GitHub
2. **Mini PC** 定时检测到新指令 → 执行 `process-pending.js`
3. **Mini PC** 把结果写入 `triggers/result.txt` → 推回 GitHub
4. **我** 看到结果

## 指令格式

`triggers/run.txt` 内容:
```
process-pending
```
