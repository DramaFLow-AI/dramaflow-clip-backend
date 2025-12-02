import { Injectable } from '@nestjs/common';
import { OssService } from 'src/common/oss/oss.service';

@Injectable()
export class UploadService {
  constructor(private readonly ossService: OssService) {}

  /**
   * 上传文件到 OSS
   * @param fileBuffer 文件 buffer
   * @param originalName 原始文件名
   * @param mimeType 文件 MIME 类型
   */
  async uploadFile(fileBuffer: Buffer, originalName: string, mimeType: string) {
    // 生成 OSS 路径（这里放到 uploads 目录，带时间戳防止重名）
    const ossKey = `uploads/${Date.now()}-${originalName}`;

    return await this.ossService.uploadBuffer(fileBuffer, ossKey, mimeType);
  }
}
