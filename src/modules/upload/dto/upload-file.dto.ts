import { ApiProperty } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: '待上传文件',
  })
  file: any;
}
