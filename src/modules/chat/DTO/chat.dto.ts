import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 普通聊天请求dto
 */
export class ChatMessageParamsDto {
  @ApiProperty({
    example: '你好世界',
    description: '用户输入的消息文本',
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

/**
 * 流式聊天请求DTO
 */
export class ChatStreamRequestDto {
  @ApiProperty({
    example: '你好世界',
    description: '流式输出的消息文本',
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

/**
 * 语音生成请求DTO
 */
export class GenerateVoiceRequestDto {
  @ApiProperty({ example: '你好世界', description: '要转换为语音的文本' })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({
    example: 'Kore',
    description: '音色名称',
    required: false,
  })
  @IsOptional()
  @IsString()
  voiceName?: string;

  @ApiProperty({
    example: 'out.wav',
    description: '输出文件名',
    required: false,
  })
  @IsOptional()
  @IsString()
  outputFile?: string;
}
