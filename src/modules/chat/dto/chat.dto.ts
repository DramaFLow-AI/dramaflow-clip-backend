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

/**
 * OpenAI 规范聊天请求DTO（适用于 DeepSeek 和 GPT）
 */
export class OpenAIChatRequestDto {
  @ApiProperty({
    example: '你好，请介绍一下你自己',
    description: '用户输入的消息文本',
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

/**
 * Token 使用统计信息
 */
export class TokenUsageDto {
  @ApiProperty({
    example: 25,
    description: '输入提示的 token 数量',
  })
  promptTokens: number;

  @ApiProperty({
    example: 150,
    description: '生成的响应 token 数量',
  })
  completionTokens: number;

  @ApiProperty({
    example: 175,
    description: '总 token 数量',
  })
  totalTokens: number;
}

/**
 * 聊天响应的统一数据结构
 */
export class ChatResponseDto {
  @ApiProperty({
    example: '你好！我是AI助手，很高兴为您服务！',
    description: 'AI 生成的回复内容',
  })
  content: string;

  @ApiProperty({
    type: TokenUsageDto,
    description: 'Token 使用统计',
  })
  usage: TokenUsageDto;

  @ApiProperty({
    example: 'gemini-2.5-flash',
    description: '使用的模型名称',
  })
  model: string;

  @ApiProperty({
    example: 1200,
    description: '响应耗时（毫秒）',
  })
  responseTime: number;
}

/**
 * VertexAI TTS 语音生成请求DTO
 */
export class VertexAiTTSRequestDto {
  @ApiProperty({
    example: '你好，欢迎使用 VertexAI 语音合成服务！',
    description: '要转换为语音的文本内容',
  })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({
    example: 'cm-CN-Wavenet-A',
    description: '语音名称，支持 Standard 和 WaveNet 语音',
    required: false,
  })
  @IsOptional()
  @IsString()
  voiceName?: string;

  @ApiProperty({
    example: 'zh-CN',
    description: '语言代码',
    required: false,
  })
  @IsOptional()
  @IsString()
  languageCode?: string;

  @ApiProperty({
    example: 1.0,
    description: '语音语速 (0.25 - 4.0)',
    required: false,
  })
  @IsOptional()
  speakingRate?: number;

  @ApiProperty({
    example: 0.0,
    description: '音调 (-20.0 - 20.0)',
    required: false,
  })
  @IsOptional()
  pitch?: number;

  @ApiProperty({
    example: 'output.wav',
    description: '输出文件名',
    required: false,
  })
  @IsOptional()
  @IsString()
  outputFile?: string;
}

/**
 * VertexAI TTS 语音生成响应DTO
 */
export class VertexAITSResponseDto {
  @ApiProperty({
    example:
      'https://your-bucket.oss-region.aliyuncs.com/audio/2025-12-04/output.wav',
    description: '生成的语音文件访问地址',
  })
  audioUrl: string;

  @ApiProperty({
    example: 'cm-CN-Wavenet-A',
    description: '使用的语音名称',
  })
  voiceName: string;

  @ApiProperty({
    example: 42,
    description: '文本字符数',
  })
  characterCount: number;

  @ApiProperty({
    example: 1500,
    description: '生成耗时（毫秒）',
  })
  generationTime: number;

  @ApiProperty({
    example: 32000,
    description: '音频采样率',
  })
  sampleRate: number;
}
