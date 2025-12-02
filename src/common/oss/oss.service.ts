import { Injectable } from '@nestjs/common';
import * as OSS from 'ali-oss';
import { env } from '../../config/config';
import * as process from 'node:process';

@Injectable()
export class OssService {
  // 阿里云 OSS 客户端实例
  private client: OSS;

  constructor() {
    /**
     * 初始化 OSS 客户端
     *  - region: OSS 数据中心区域，比如 'oss-cn-hangzhou'
     *  - accessKeyId / accessKeySecret: 阿里云账号的 AccessKey，用于身份验证
     *  - bucket: 默认的存储桶名称
     */
    this.client = new OSS({
      region: env.OSS_REGION,
      accessKeyId: env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET || '',
      bucket: env.OSS_BUCKET,
      endpoint:
        process.env.NODE_ENV === 'prod'
          ? `${env.OSS_REGION}-internal.aliyuncs.com`
          : `${env.OSS_REGION}.aliyuncs.com`,
    });
  }

  /**
   * 上传本地文件到 OSS
   * @param filePath 本地文件路径，例如 '/tmp/example.png'
   * @param fileName OSS 上的文件名（包括路径），例如 'images/example.png'
   * @returns 返回文件 URL 和文件名
   */
  async upload(filePath: string, fileName: string) {
    try {
      const result = await this.client.put(fileName, filePath);
      return { url: result.url, name: fileName };
    } catch (error) {
      console.error('OSS 上传失败:', error);
      throw error;
    }
  }

  /**
   * 从 OSS 删除文件
   * @param fileName OSS 上的文件名（包括路径）
   * @returns 删除成功返回 true
   */
  async delete(fileName: string) {
    try {
      await this.client.delete(fileName);
      return true;
    } catch (error) {
      console.error('OSS 删除失败:', error);
      throw error;
    }
  }

  /**
   * 上传 Buffer 数据到 OSS
   * @param buffer 文件的二进制数据（Buffer 对象）
   * @param ossKey OSS 上的文件路径，例如 'audio/2025-08-12/file.wav'
   * @param contentType 文件 MIME 类型（可选），例如 'audio/wav'、'image/png'
   * @returns 返回文件 URL 和文件名
   */
  async uploadBuffer(buffer: Buffer, ossKey: string, contentType?: string) {
    try {
      const result = await this.client.put(ossKey, buffer, {
        headers: { 'Content-Type': contentType || 'application/octet-stream' },
      });
      return { url: result.url, name: ossKey };
    } catch (error) {
      console.error('OSS 上传失败:', error);
      throw error;
    }
  }

  /**
   * 获取 OSS 文件的签名 URL（用于临时访问私有文件）
   * @param fileName OSS 上的文件路径
   * @param expires 签名 URL 的有效时间（秒），默认 3600 秒（1 小时）
   * @returns 带签名的可访问 URL
   */
  getSignatureUrl(fileName: string, expires = 3600) {
    return this.client.signatureUrl(fileName, { expires });
  }
}
