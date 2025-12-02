import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as process from 'process';
import * as path from 'path';

// 手动加载 env 文件（根据 NODE_ENV 区分加载不同文件）
// 支持三种环境：dev（开发）、staging（测试服务器）、prod（正式服务器）
const getEnvFile = () => {
  const env = process.env.NODE_ENV;
  switch (env) {
    case 'dev':
      return '.env.dev';
    case 'staging':
      return '.env.staging';
    case 'prod':
      return '.env.prod';
    default:
      console.warn(`未知的 NODE_ENV: ${env}，使用默认 .env.dev`);
      return '.env.dev';
  }
};

dotenv.config({
  path: path.resolve(process.cwd(), getEnvFile()),
});

const envSchema = z.object({
  USE_PROXY: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  PROXY_URL: z.string().url().optional(),
  PORT: z.string().regex(/^\d+$/).transform(Number),
  GEMINI_API_KEY: z.string(),
  REDIS_URL: z.string(),
  REDIS_PASSWORD: z.string(),
  REDIS_PROT: z.string().transform(Number),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  OSS_REGION: z.string(),
  OSS_ACCESS_KEY_ID: z.string(),
  OSS_ACCESS_KEY_SECRET: z.string(),
  OSS_BUCKET: z.string(),
  MINIMAX_GROUP_ID: z.string(),
  MINIMAX_API_KEY: z.string(),
  OPENAI_KEY: z.string(),
  // GCP Vertex AI 配置
  GCP_PROJECT_ID: z.string().default('dramabyte-474012'),
  GCP_LOCATION: z.string().default('us-central1'),
  GCP_SERVICE_ACCOUNT_PATH: z.string().default('./sa.json'),
});

export const validateEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('环境变量验证失败');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
};

// 2️⃣ 校验 process.env
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('环境变量验证失败！');
  console.error(_env.error.format());
  process.exit(1); // 退出进程
}

// 3️⃣ 导出验证后的、类型安全的 env
export const env = _env.data;
