import { VertexAI } from '@google-cloud/vertexai';
import { env } from '../config/config';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * 创建带代理支持的 VertexAI 实例
 * @param project GCP 项目 ID
 * @param location 区域，如 'us-central1'
 * @param keyFile 服务账号 JSON 文件路径（可选）
 */
export function createVertexAI(
  project: string,
  location: string,
  keyFile?: string,
): VertexAI {
  const googleAuthOptions: any = {
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  };

  // 如果提供了 keyFile，使用它
  if (keyFile) {
    googleAuthOptions.keyFile = keyFile;
  }

  // 如果启用代理，配置 HTTP Agent
  if (env.USE_PROXY && env.PROXY_URL) {
    const proxyAgent = new HttpsProxyAgent(env.PROXY_URL);

    // gaxios 需要通过 agent 选项配置代理
    // 同时设置 httpAgent 和 httpsAgent
    googleAuthOptions.transportOptions = {
      agent: proxyAgent,
      // gaxios 特定配置
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    };

    console.log(`✅ VertexAI 已启用代理: ${env.PROXY_URL}`);
  } else {
    console.log('ℹ️ VertexAI 未启用代理');
  }

  return new VertexAI({
    project,
    location,
    googleAuthOptions,
  });
}
