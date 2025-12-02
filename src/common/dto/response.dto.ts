// response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ResponseDto<T> {
  @ApiProperty({ example: 0, description: '业务状态码，0 表示成功' })
  code: number;

  @ApiProperty({ example: 'success', description: '提示信息' })
  msg: string;

  @ApiProperty({ description: '返回数据' })
  data: T;
}
