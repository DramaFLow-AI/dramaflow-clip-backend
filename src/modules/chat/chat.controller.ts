import {
  Controller,
  Post,
  Get,
  Res,
  Body,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ApiBody, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  ChatMessageParamsDto,
  ChatStreamRequestDto,
  GenerateVoiceRequestDto,
  OpenAIChatRequestDto,
  ChatResponseDto,
  VertexAiTTSRequestDto,
  VertexAITSResponseDto,
} from './DTO/chat.dto';
import { ApiResponseDto } from '../../common/decorators/api-response.decorator';

@ApiTags('Chat 聊天')
@Controller('gemini')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  private readonly logger = new Logger(ChatController.name);

  @Post('chat')
  @ApiOperation({
    summary: 'Gemini 聊天接口',
    description:
      '接收用户消息，返回 Gemini 模型生成的回复，包含 token 统计信息。',
  })
  @ApiBody({ type: ChatMessageParamsDto })
  @ApiResponseDto(ChatResponseDto, false, 'Gemini结果', {
    content: '你好！很高兴你来这里。有什么我可以帮忙的吗？',
    usage: {
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
    },
    model: 'gemini-2.5-flash',
    responseTime: 1200,
  })
  async handleChat(@Body() body: ChatMessageParamsDto) {
    try {
      const result = await this.chatService.chat(body.message);
      if (!result) {
        throw new BadRequestException('生成回复失败');
      }
      return result;
    } catch (error) {
      this.logger.error('出错啦', error);
      throw error;
    }
  }

  @Post('stream')
  @ApiOperation({ summary: 'Gemini 流式聊天接口（SSE）' })
  @ApiProduces('text/event-stream')
  @ApiBody({ type: ChatStreamRequestDto })
  @ApiResponseDto(
    String,
    false,
    '流式响应内容',
    '你好！很高兴你来这里。有什么我可以帮忙的吗？',
  )
  async handleChatStream(
    @Body() body: ChatStreamRequestDto,
    @Res() res: Response,
  ) {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let fullText = '';

      await this.chatService.chatStream(body.message, (chunk: string) => {
        fullText += chunk;
        res.write(
          `data: ${JSON.stringify({
            code: 0,
            msg: 'success',
            data: fullText,
          })}\n\n`,
        );
      });

      res.end();
    } catch (error) {
      this.logger.error('流式聊天出错', error);
      throw error;
    }
  }

  @Post('generate-voice')
  @ApiOperation({ summary: '生成语音接口' })
  @ApiBody({ type: GenerateVoiceRequestDto })
  @ApiResponseDto(String, false, '语音文件地址', 'https://www.baidu.com')
  async handleGenerateVoice(@Body() body: GenerateVoiceRequestDto) {
    try {
      const { text, voiceName, outputFile = 'out.wav' } = body;

      return await this.chatService.generateVoice(text, voiceName, outputFile);
    } catch (error) {
      this.logger.error('生成语音失败', error);
      throw error;
    }
  }
}

@ApiTags('DeepSeek 聊天')
@Controller('deepseek')
export class DeepSeekController {
  constructor(private readonly chatService: ChatService) {}

  private readonly logger = new Logger(DeepSeekController.name);

  @Post('chat')
  @ApiOperation({
    summary: 'DeepSeek 聊天接口',
    description:
      '接收用户消息，返回 DeepSeek 模型生成的回复，包含 token 统计信息。',
  })
  @ApiBody({ type: OpenAIChatRequestDto })
  @ApiResponseDto(ChatResponseDto, false, 'DeepSeek结果', {
    content: '你好！我是DeepSeek，很高兴为您服务！',
    usage: {
      promptTokens: 18,
      completionTokens: 30,
      totalTokens: 48,
    },
    model: 'deepseek/deepseek-v3.2',
    responseTime: 800,
  })
  async handleDeepSeekChat(@Body() body: OpenAIChatRequestDto) {
    try {
      const result = await this.chatService.deepSeekChat(body.message);
      if (!result) {
        throw new BadRequestException('生成回复失败');
      }
      return result;
    } catch (error) {
      this.logger.error('DeepSeek 聊天出错', error);
      throw error;
    }
  }
}

@ApiTags('GPT 聊天')
@Controller('gpt')
export class GPTController {
  constructor(private readonly chatService: ChatService) {}

  private readonly logger = new Logger(GPTController.name);

  @Post('chat')
  @ApiOperation({
    summary: 'GPT 聊天接口',
    description: '接收用户消息，返回 GPT 模型生成的回复，包含 token 统计信息。',
  })
  @ApiBody({ type: OpenAIChatRequestDto })
  @ApiResponseDto(ChatResponseDto, false, 'GPT结果', {
    content: '你好！我是GPT，很高兴为您服务！',
    usage: {
      promptTokens: 16,
      completionTokens: 28,
      totalTokens: 44,
    },
    model: 'pa/gt-4p',
    responseTime: 900,
  })
  async handleGPTChat(@Body() body: OpenAIChatRequestDto) {
    try {
      const result = await this.chatService.gptChat(body.message);
      if (!result) {
        throw new BadRequestException('生成回复失败');
      }
      return result;
    } catch (error) {
      this.logger.error('GPT 聊天出错', error);
      throw error;
    }
  }
}

@ApiTags('VertexAI TTS')
@Controller('vertexai-tts')
export class VertexAITTSController {
  constructor(private readonly chatService: ChatService) {}

  private readonly logger = new Logger(VertexAITTSController.name);

  @Get('voices')
  @ApiOperation({
    summary: '获取 VertexAI TTS 支持的语音列表',
    description:
      '查询所有可用的 VertexAI Text-to-Speech 语音，包括中文、英文、日文、韩文等多种语言。',
  })
  @ApiResponseDto(Object, false, 'VertexAI TTS 语音列表', {
    chinese: {
      languageCode: 'zh-CN',
      standard: [
        {
          name: 'cm-CN-Standard-A',
          description: '中文女声 (标准语音)',
          gender: 'female',
        },
        {
          name: 'cm-CN-Standard-B',
          description: '中文女声 (标准语音)',
          gender: 'female',
        },
        {
          name: 'cm-CN-Standard-C',
          description: '中文男声 (标准语音)',
          gender: 'male',
        },
        {
          name: 'cm-CN-Standard-D',
          description: '中文女声 (标准语音)',
          gender: 'female',
        },
      ],
      wavenet: [
        {
          name: 'cm-CN-Wavenet-A',
          description: '中文女声 (高品质 WaveNet)',
          gender: 'female',
        },
        {
          name: 'cm-CN-Wavenet-B',
          description: '中文男声 (高品质 WaveNet)',
          gender: 'male',
        },
        {
          name: 'cm-CN-Wavenet-C',
          description: '中文女声 (高品质 WaveNet)',
          gender: 'female',
        },
        {
          name: 'cm-CN-Wavenet-D',
          description: '中文男声 (高品质 WaveNet)',
          gender: 'male',
        },
      ],
    },
    english: {
      languageCode: 'en-US',
      standard: [
        {
          name: 'en-US-Standard-A',
          description: '美式女声 (标准语音)',
          gender: 'female',
        },
        {
          name: 'en-US-Standard-B',
          description: '美式男声 (标准语音)',
          gender: 'male',
        },
      ],
      wavenet: [
        {
          name: 'en-US-Wavenet-A',
          description: '美式女声 (高品质 WaveNet)',
          gender: 'female',
        },
        {
          name: 'en-US-Wavenet-B',
          description: '美式男声 (高品质 WaveNet)',
          gender: 'male',
        },
      ],
    },
  })
  getVertexAIVoices() {
    try {
      return this.chatService.getVertexAIVoices();
    } catch (error) {
      this.logger.error('获取 VertexAI TTS 语音列表出错', error);
      throw error;
    }
  }

  @Post('generate')
  @ApiOperation({
    summary: 'VertexAI TTS 语音合成接口',
    description:
      '使用 Google VertexAI Text-to-Speech 服务生成高质量语音，支持 Standard 和 WaveNet 语音。',
  })
  @ApiBody({ type: VertexAiTTSRequestDto })
  @ApiResponseDto(VertexAITSResponseDto, false, 'VertexAI TTS 语音生成结果', {
    audioUrl:
      'https://example-bucket.oss-cn-shanghai.aliyuncs.com/audio/2025-12-04/vertexai-tts-1704312123456.wav',
    voiceName: 'cm-CN-Wavenet-A',
    characterCount: 18,
    generationTime: 1200,
    sampleRate: 24000,
  })
  async handleVertexAITTS(@Body() body: VertexAiTTSRequestDto) {
    try {
      const result = await this.chatService.generateVertexAIVoice(body);
      if (!result) {
        throw new BadRequestException('语音生成失败');
      }
      return result;
    } catch (error) {
      this.logger.error('VertexAI TTS 生成出错', error);
      throw error;
    }
  }
}
