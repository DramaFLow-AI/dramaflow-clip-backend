# Gemini Nest 项目文档

基于 NestJS 构建的 AI 聊天与语音生成后端服务。

## 📋 项目概览

一个功能完整的后端服务，集成了多种 AI 能力和云服务：

- **AI 能力**：Vertex AI (Gemini 2.5)、OpenAI (PPIO)、MiniMax TTS
- **存储服务**：阿里云 OSS、AWS S3
- **数据库**：Prisma + MySQL
- **队列系统**：BullMQ + Redis
- **核心框架**：NestJS v11 + TypeScript
- **特色功能**：
  - 统一响应格式与异常处理
  - 日志轮转（按日期自动分割）
  - 双 API 文档（Scalar + Swagger）
  - 多环境打包支持
  - 代理支持（含 VertexAI）
  - 跨平台兼容

## 🚀 快速开始

### 1. 安装依赖
```bash
pnpm install
```

### 2. 配置环境变量
```bash
# 复制示例文件
cp .env.example .env.dev

# 编辑 .env.dev，填入真实配置
```

### 3. 生成 Prisma 客户端
```bash
pnpm run prisma:generate
```

### 4. 启动开发服务器
```bash
pnpm run start:dev
```

### 5. 访问 API 文档
- **Scalar UI（推荐）**：http://localhost:3000/docs
- **Swagger UI**：http://localhost:3000/api-docs

## 📂 目录结构

```
src/
├── common/                      # 公共模块
│   ├── decorators/              # 自定义装饰器
│   ├── filters/                 # 全局异常过滤器和响应拦截器
│   ├── oss/                     # OSS 服务封装
│   └── swagger/                 # API 文档配置
├── config/                      # 环境变量配置与校验
│   ├── config.ts                # Zod 校验逻辑
│   └── config.type.ts           # 配置类型定义
├── modules/                     # 业务模块
│   ├── chat/                    # 聊天与语音生成
│   │   ├── chat.controller.ts  # 聊天接口
│   │   ├── chat.service.ts     # AI 服务集成
│   │   └── DTO/                 # 数据传输对象
│   ├── tts/                     # TTS 任务队列
│   │   ├── tts.controller.ts   # 任务管理接口
│   │   ├── tts.service.ts      # 任务调度
│   │   └── tts.processor.ts    # 队列处理器
│   ├── menu/                    # 菜单管理
│   └── upload/                  # 文件上传
├── prisma/                      # Prisma ORM
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── utils/                       # 工具函数
│   ├── s3.ts                    # S3 客户端配置
│   ├── vertexai.ts              # VertexAI 带代理配置
│   └── setupUndiciProxy.ts      # 全局代理设置
└── main.ts                      # 应用入口

prisma/
└── schema.prisma                # 数据库模型定义

logs/                            # 日志目录（自动生成）
├── error-2025-11-28.log         # 按日期分割的错误日志
└── combined-2025-11-28.log      # 按日期分割的综合日志
```

## 🛠️ 技术栈

### 核心框架
- **NestJS** v11 - 渐进式 Node.js 框架
- **TypeScript** - 类型安全
- **Express** - HTTP 服务器

### 数据层
- **Prisma** - 类型安全的 ORM
- **MySQL** - 关系型数据库
- **Redis** - 缓存与队列

### AI 服务
- **@google-cloud/vertexai** - Vertex AI Gemini 2.5
- **@google/genai** - Gemini TTS
- **OpenAI SDK** - OpenAI API（PPIO 代理）
- **MiniMax API** - 中文 TTS

### 存储服务
- **ali-oss** - 阿里云对象存储
- **@aws-sdk/client-s3** - AWS S3

### 任务队列
- **BullMQ** - 基于 Redis 的任务队列
- **@nestjs/bullmq** - NestJS 集成

### 工具库
- **zod** - 环境变量校验
- **winston** - 日志记录
- **winston-daily-rotate-file** - 日志轮转
- **cross-env** - 跨平台环境变量
- **undici** - HTTP 客户端与代理
- **https-proxy-agent** - HTTPS 代理

### API 文档
- **@nestjs/swagger** - Swagger 文档
- **@scalar/nestjs-api-reference** - Scalar API 文档（现代化 UI）

## 🌍 环境配置

### 支持的环境

| 环境 | 配置文件 | 用途 | 启动命令 |
|------|---------|------|---------|
| **development** | `.env.dev` | 本地开发 | `pnpm run start:dev` |
| **staging** | `.env.staging` | 测试服务器 | `pnpm run build:staging` |
| **production** | `.env.prod` | 正式服务器 | `pnpm run build:prod` |

### 环境变量说明

详见 `.env.example` 文件，主要配置项：

```bash
# 应用配置
PORT=3000

# 代理配置（可选）
USE_PROXY=false
PROXY_URL=http://127.0.0.1:7890

# 数据库
DATABASE_URL=mysql://user:password@host:port/database

# Redis
REDIS_URL=localhost
REDIS_PASSWORD=your_password
REDIS_PROT=6379

# GCP Vertex AI
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GCP_SERVICE_ACCOUNT_PATH=./sa.json

# AI 服务
GEMINI_API_KEY=your_key
OPENAI_KEY=your_key
MINIMAX_API_KEY=your_key
MINIMAX_GROUP_ID=your_group_id

# 存储服务
OSS_REGION=oss-cn-shanghai
OSS_ACCESS_KEY_ID=your_id
OSS_ACCESS_KEY_SECRET=your_secret
OSS_BUCKET=your_bucket

AWS_ACCESS_KEY_ID=your_id
AWS_SECRET_ACCESS_KEY=your_key
```

## 📝 可用脚本

### 开发
```bash
pnpm run start:dev          # 开发模式（热重载）
pnpm run start:debug        # 调试模式
```

### 构建
```bash
pnpm run build              # 构建所有环境
pnpm run build:staging      # 构建测试环境
pnpm run build:prod         # 构建生产环境
```

### 启动（打包后）
```bash
pnpm run start:staging      # 启动测试环境
pnpm run start:prod         # 启动生产环境
```

### 质量检查
```bash
pnpm run lint               # ESLint 检查
pnpm run format             # Prettier 格式化
pnpm run test               # 单元测试
pnpm run test:e2e           # E2E 测试
pnpm run test:cov           # 测试覆盖率
```

### 数据库
```bash
pnpm run prisma:generate    # 生成 Prisma 客户端
pnpm run prisma:pull        # 从数据库拉取模型
pnpm run prisma:studio      # 打开 Prisma Studio
```

## 📡 API 接口

所有接口前缀：`/api`

### 聊天与语音（Chat）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/gemini/chat` | Gemini 文本聊天 |
| POST | `/api/gemini/stream` | Gemini 流式聊天（SSE）|
| POST | `/api/gemini/generate-voice` | 生成语音（Gemini/MiniMax）|

### TTS 任务（TTS Task）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/tts-task/create` | 创建批量 TTS 任务 |
| PUT | `/api/tts-task/update` | 更新指定片段 |
| GET | `/api/tts-task/status` | 查询任务明细 |
| GET | `/api/tts-task/overall-status` | 查询聚合状态 |
| POST | `/api/tts-task/retry` | 重试失败任务 |

### 文件上传（Upload）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/upload/file` | 上传文件到 OSS |

### 菜单（Menu）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/menu/menu-list` | 获取路由树 |

## 🎨 API 文档

启动应用后，访问以下地址查看 API 文档：

### Scalar UI（推荐）
```
http://localhost:3000/docs
```

**特点：**
- 🎨 现代化设计，类似 Postman
- 🌙 暗色主题
- 🔍 快捷键搜索（Ctrl/Cmd + K）
- 📱 响应式布局
- 💻 自动生成多种语言代码示例
- 🌏 完美中文支持

### Swagger UI（传统）
```
http://localhost:3000/api-docs
```

## 🔧 核心功能详解

### 1. AI 聊天服务

**Gemini 文本聊天**
- 模型：`gemini-2.5-flash`
- 支持流式输出（SSE）
- 自动处理代理

**OpenAI/DeepSeek 聊天**
- 通过 PPIO 代理访问
- 支持流式输出

### 2. 语音合成（TTS）

**Gemini TTS**
- 支持英文语音合成
- 可用语音：Kore, Puck, Charon, Fenrir, Aoede
- 输出格式：WAV

**MiniMax TTS**
- 支持中文语音合成
- 丰富的语音选择
- 可调节语速、音量、音调

### 3. 任务队列系统

基于 BullMQ 的异步任务处理：
- 批量 TTS 任务管理
- 失败自动重试（指数退避）
- 任务状态追踪
- 并发控制

### 4. 日志系统

**自动日志轮转：**
- 按日期分割日志文件
- 错误日志保留 14 天
- 综合日志保留 7 天
- 单文件最大 20MB

**日志文件：**
```
logs/
├── error-2025-11-28.log      # 今天的错误日志
├── error-2025-11-27.log      # 昨天的错误日志
├── combined-2025-11-28.log   # 今天的综合日志
└── combined-2025-11-27.log   # 昨天的综合日志
```

### 5. 代理支持

**全局代理：**
- 支持所有 HTTP/HTTPS 请求
- 通过 `USE_PROXY` 和 `PROXY_URL` 配置

**VertexAI 专用代理：**
- 为 Google Cloud API 单独配置代理
- 支持认证请求代理

### 6. 统一响应格式

**成功响应：**
```json
{
  "code": 0,
  "msg": "success",
  "data": { ... }
}
```

**错误响应：**
```json
{
  "code": 400,
  "msg": "请求参数错误",
  "data": null
}
```

## 📦 部署指南

详细部署文档请查看 [DEPLOY.md](./DEPLOY.md)

### 快速部署

**1. 本地打包**
```bash
# 测试环境
pnpm run build:staging

# 生产环境
pnpm run build:prod
```

**2. 上传到服务器**
```bash
scp -r dist/* user@server:/app/
```

**3. 服务器安装依赖**
```bash
cd /app
pnpm install --prod
```

**4. 启动应用**
```bash
# 方式 1：使用启动脚本（推荐）
chmod +x start.sh
./start.sh staging

# 方式 2：直接启动
NODE_ENV=staging node src/main.js

# 方式 3：使用 PM2
pm2 start ecosystem.config.js --only gemini-staging
```

## ⚠️ 注意事项

### 安全
1. **不要提交敏感信息**
   - `.env.*` 文件已在 `.gitignore` 中
   - `sa.json` 服务账号文件不要提交

2. **生产环境配置**
   - 使用强密码
   - 限制数据库和 Redis 访问权限
   - 配置防火墙规则

### 代理
1. **开发环境**
   - 可以启用代理访问 Google API
   - `USE_PROXY=true`

2. **生产环境**
   - 服务器通常不需要代理
   - `USE_PROXY=false`

### VertexAI
1. **服务账号**
   - 确保 `sa.json` 文件存在
   - 路径通过 `GCP_SERVICE_ACCOUNT_PATH` 配置

2. **权限**
   - 服务账号需要 Vertex AI 访问权限

### 日志
1. **磁盘空间**
   - 日志会自动清理，但仍需监控
   - 最多占用约 420MB

2. **敏感数据**
   - 聊天内容不会被记录
   - 只记录错误和系统日志

## 🐛 故障排查

### 问题：环境变量验证失败
**解决：** 检查对应的 `.env` 文件是否存在且完整

### 问题：VertexAI 连接超时
**解决：**
1. 检查代理配置
2. 确认 `sa.json` 文件路径正确
3. 验证服务账号权限

### 问题：Redis 连接失败
**解决：** 检查 `REDIS_URL`、`REDIS_PASSWORD`、`REDIS_PROT` 配置

### 问题：日志文件过大
**解决：** 日志会自动轮转，检查 `winston-daily-rotate-file` 配置

## 📄 许可证

UNLICENSED - 私有项目

## 🤝 贡献

暂不接受外部贡献

## 📮 联系方式

如有问题，请创建 Issue
