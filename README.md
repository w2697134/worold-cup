# World Cup Predictor

2026 世界杯预测工具。主流程是选择比赛、整理情报、生成比分预测，并按用户账号隔离知识库和预测记录。

## 功能

- 比赛列表与当前选中状态
- 单场知识库：联网搜索、导入、自动整理
- DeepSeek 预测比分
- 历史复盘与策略参考
- 登录后按用户隔离知识库和预测缓存

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:5176
```

## 环境变量

复制 `.env.example` 为 `.env.local`，再填入真实密钥。不要提交 `.env.local`。

常用变量：

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=flash
DASHSCOPE_API_KEY=
QWEN_SEARCH_ENABLED=true
DATABASE_URL=
```

没有数据库时，本地会退回浏览器存储；生产环境建议配置 PostgreSQL。

## 构建

普通构建：

```bash
npm run build
```

挂到 Haovio `/projects/worldcup` 时：

```bash
NEXT_PUBLIC_BASE_PATH=/projects/worldcup npm run build
```

## 部署说明

生产环境不要开新公网端口。推荐让 Next.js 只监听 `127.0.0.1` 内部端口，再由 Haovio 主服务反向代理：

```text
/projects/worldcup/
```

真实密钥放服务器 `.env` 或 systemd 环境文件，不写入 GitHub。
