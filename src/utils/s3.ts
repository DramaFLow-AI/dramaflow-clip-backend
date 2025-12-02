import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { env } from '../config/config';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';

const config: S3ClientConfig = {
  region: 'ap-northeast-1', // 区域
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
  },
};

// 判断是否启用代理
if (env.USE_PROXY) {
  const proxyAgent = new HttpsProxyAgent(env.PROXY_URL || '');
  config.requestHandler = new NodeHttpHandler({
    httpAgent: proxyAgent,
    httpsAgent: proxyAgent,
  });
}

export const s3 = new S3Client(config);
