import { ApiProperty } from '@nestjs/swagger';

export class UploadFileResponseDto {
  @ApiProperty({
    example:
      'https://your-bucket.oss-cn-shanghai.aliyuncs.com/uploads/1692612345678-test.png',
    description: '文件访问 URL',
  })
  url: string;

  @ApiProperty({
    example: 'uploads/1692612345678-test.png',
    description: 'OSS 文件路径（key）',
  })
  name: string;
}
