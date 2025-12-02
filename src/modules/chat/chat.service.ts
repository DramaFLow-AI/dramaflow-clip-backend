import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  VertexAI,
  GenerativeModel,
  FinishReason,
} from '@google-cloud/vertexai';
import { pcmToWavBuffer } from '../../utils/pcmToWavBuffer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { OssService } from '../../common/oss/oss.service';
import { env } from '../../config/config';
import { s3 } from '../../utils/s3';
import { createVertexAI } from '../../utils/vertexai';
import * as dayjs from 'dayjs';
import { MinimaxTTSResponse } from './types';
import OpenAI from 'openai';

/**
 * 聊天与语音生成服务
 * 集成 Vertex AI (Gemini)、OpenAI (PPIO)、MiniMax TTS
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Vertex AI 相关
  private readonly vertexAI: VertexAI;
  private readonly genModel: GenerativeModel;

  // Google GenAI (用于 Gemini TTS)
  private readonly genAI: GoogleGenAI;

  // OpenAI 客户端 (PPIO)
  private readonly openAIClient: OpenAI;

  // MiniMax 配置
  private readonly miniMaxApiKey: string;
  private readonly miniMaxGroupId: string;

  constructor(private readonly ossService: OssService) {
    // 初始化 MiniMax 配置
    this.miniMaxApiKey = env.MINIMAX_API_KEY;
    this.miniMaxGroupId = env.MINIMAX_GROUP_ID;

    // 初始化 OpenAI 客户端 (服务商为 PPIO)
    this.openAIClient = new OpenAI({
      baseURL: 'https://api.ppinfra.com/openai',
      apiKey: env.OPENAI_KEY,
    });

    // 初始化 Vertex AI (带代理支持)
    this.vertexAI = createVertexAI(
      env.GCP_PROJECT_ID,
      env.GCP_LOCATION,
      env.GCP_SERVICE_ACCOUNT_PATH,
    );

    // 获取 Gemini 模型
    this.genModel = this.vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    // 初始化 Google GenAI (用于 Gemini TTS)
    this.genAI = new GoogleGenAI({
      vertexai: true,
      location: env.GCP_LOCATION,
      project: env.GCP_PROJECT_ID,
    });
  }

  /**
   * Gemini 文本聊天
   * @param prompt 用户输入的文本
   * @returns 模型生成的文本响应
   */
  async chat(prompt: string): Promise<string> {
    try {
      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      };

      this.logger.log(`开始 Gemini 聊天请求，prompt 长度: ${prompt.length}`);
      const response = await this.genModel.generateContent(request);

      // 检查是否有候选结果
      const candidates = response.response?.candidates;
      if (!candidates || candidates.length === 0) {
        this.logger.error('Gemini 未返回任何候选结果', {
          response: JSON.stringify(response),
        });
        throw new BadRequestException(
          'Gemini 模型未返回任何候选结果，请稍后重试',
        );
      }

      const firstCandidate = candidates[0];

      // 检查 finishReason，判断是否因为安全策略或其他原因被阻止
      const finishReason = firstCandidate?.finishReason;
      if (finishReason && finishReason !== FinishReason.STOP) {
        this.logger.warn(`Gemini 响应异常结束: ${finishReason}`, {
          finishReason,
          safetyRatings: firstCandidate?.safetyRatings,
        });

        // 根据不同的 finishReason 返回不同的错误信息
        switch (finishReason) {
          case FinishReason.SAFETY:
            throw new BadRequestException(
              '您的请求因安全策略被阻止，请修改后重试',
            );
          case FinishReason.RECITATION:
            throw new BadRequestException(
              '您的请求可能触发了版权内容检测，请修改后重试',
            );
          case FinishReason.MAX_TOKENS:
            throw new BadRequestException('响应内容超出最大长度限制');
          case FinishReason.OTHER:
          default:
            throw new BadRequestException(
              `Gemini 响应异常: ${finishReason}，请稍后重试`,
            );
        }
      }

      // 提取响应文本
      const text = firstCandidate?.content?.parts?.[0]?.text;
      if (!text || text.trim() === '') {
        this.logger.error('Gemini 返回了空响应', {
          candidate: JSON.stringify(firstCandidate),
        });
        throw new BadRequestException('Gemini 返回了空响应，请重试');
      }

      this.logger.log(`Gemini 聊天成功，响应长度: ${text.length}`);
      return text;
    } catch (error) {
      // 如果已经是 BadRequestException，直接抛出
      if (error instanceof BadRequestException) {
        throw error;
      }

      // 记录其他错误（如网络错误、超时等）
      this.logger.error('Gemini 聊天请求失败', {
        error: error.message,
        stack: error.stack,
      });

      throw new BadRequestException(
        `Gemini 服务调用失败: ${error.message || '未知错误'}`,
      );
    }
  }

  /**
   * 流式聊天 (使用 OpenAI/DeepSeek)
   * @param prompt 用户输入的文本
   * @param onChunk 接收文本块的回调函数
   */
  async chatStream(
    prompt: string,
    onChunk: (text: string) => void,
  ): Promise<void> {
    const stream = await this.openAIClient.chat.completions.create({
      model: 'deepseek/deepseek-r1',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        onChunk(content);
      }
    }
  }

  /**
   * 生成语音并上传到 OSS
   * @param text 要合成的文本
   * @param voiceName 语音名称 (Gemini: 'Kore' 等, MiniMax: voice_id)
   * @param outputFile 输出文件名
   * @param provider 语音提供商 ('gemini' | 'minimax')
   * @returns 音频文件的 URL
   */
  async generateVoice(
    text: string,
    voiceName = 'Kore',
    outputFile = 'out.wav',
    provider: string = 'gemini',
  ): Promise<string> {
    if (provider === 'gemini') {
      return this.generateGeminiVoice(text, voiceName, outputFile);
    } else if (provider === 'minimax') {
      return this.generateMinimaxVoice(text, voiceName, outputFile);
    }

    throw new BadRequestException(`不支持的 TTS 提供商: ${provider}`);
  }

  /**
   * 使用 Gemini TTS 生成语音
   */
  private async generateGeminiVoice(
    text: string,
    voiceName: string,
    outputFile: string,
  ): Promise<string> {
    const response = await this.genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });

    const audioData =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error('Gemini TTS 未返回音频数据');
    }

    const pcmBuffer = Buffer.from(audioData, 'base64');
    const wavBuffer = await pcmToWavBuffer(pcmBuffer);

    return this.uploadBufferToOss(wavBuffer, outputFile);
  }

  /**
   * 使用 MiniMax TTS 生成语音
   */
  private async generateMinimaxVoice(
    text: string,
    voiceName: string,
    outputFile: string,
  ): Promise<string> {
    const url = `https://api-bj.minimaxi.com/v1/t2a_v2?GroupId=${this.miniMaxGroupId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.miniMaxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'speech-2.5-hd-preview',
        text,
        stream: false,
        voice_setting: {
          voice_id: voiceName,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'wav',
          channel: 1,
        },
      }),
    });

    const data = (await response.json()) as MinimaxTTSResponse;

    if (data.base_resp.status_code !== 0) {
      throw new Error(`MiniMax TTS 错误: ${data.base_resp.status_msg}`);
    }

    const audioBuffer = Buffer.from(data.data.audio, 'hex');
    return this.uploadBufferToOss(audioBuffer, outputFile);
  }

  /**
   * 上传 Buffer 到 OSS，按日期文件夹存储
   */
  private async uploadBufferToOss(
    audioBuffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const currentDate = dayjs().format('YYYY-MM-DD');
    const ossKey = `audio/${currentDate}/${fileName}`;

    const result = await this.ossService.uploadBuffer(
      audioBuffer,
      ossKey,
      'audio/wav',
    );

    return result.url;
  }

  /**
   * 上传 Buffer 到 S3，按日期文件夹存储
   * @deprecated 当前项目主要使用 OSS，保留此方法以备不时之需
   */
  private async uploadBufferToS3(
    audioBuffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const currentDate = dayjs().format('YYYY-MM-DD');
    const key = `audio/${currentDate}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: 'dramaflow-ai',
      Key: key,
      Body: audioBuffer,
      ContentType: 'audio/wav',
    });

    await s3.send(command);

    return `https://dramaflow-ai.s3.ap-northeast-1.amazonaws.com/${key}`;
  }
}
