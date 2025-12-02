import {
  Controller,
  Post,
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
    description: '接收用户消息，返回 Gemini 模型生成的回复。',
  })
  @ApiBody({ type: ChatMessageParamsDto })
  @ApiResponseDto(
    String,
    false,
    'Gemini结果',
    '你好！很高兴你来这里。有什么我可以帮忙的吗？',
  )
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
