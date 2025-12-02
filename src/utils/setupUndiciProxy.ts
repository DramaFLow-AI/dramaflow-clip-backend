// src/utils/setupUndiciProxy.ts
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { env } from '../config/config'; // 你自己 zod 校验并导出的 env 对象

export function setupUndiciProxy() {
  if (env.USE_PROXY) {
    if (!env.PROXY_URL) {
      throw new Error('USE_PROXY 为 true 时必须提供 PROXY_URL');
    }

    const proxyAgent = new ProxyAgent({
      uri: env.PROXY_URL,
    });

    setGlobalDispatcher(proxyAgent);

    // ✅ 设置环境变量，让 Google Auth Library 等库也能使用代理
    process.env.HTTP_PROXY = env.PROXY_URL;
    process.env.HTTPS_PROXY = env.PROXY_URL;
    process.env.http_proxy = env.PROXY_URL;
    process.env.https_proxy = env.PROXY_URL;

    console.log(`✅ 已启用 undici fetch 代理: ${env.PROXY_URL}`);
    console.log(`✅ 已设置环境变量代理: HTTP_PROXY/HTTPS_PROXY`);
  } else {
    console.log('ℹ️ 未启用代理，使用默认 fetch');
  }
}
