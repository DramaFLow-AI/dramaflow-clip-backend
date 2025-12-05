import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  VertexAI,
  GenerativeModel,
  FinishReason,
} from '@google-cloud/vertexai';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { pcmToWavBuffer } from '../../utils/pcmToWavBuffer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { OssService } from '../../common/oss/oss.service';
import { env } from '../../config/config';
import { s3 } from '../../utils/s3';
import { createVertexAI } from '../../utils/vertexai';
import * as dayjs from 'dayjs';
import { MinimaxTTSResponse } from './types';
import OpenAI from 'openai';
import {
  ChatResponseDto,
  TokenUsageDto,
  VertexAiTTSRequestDto,
  VertexAITSResponseDto,
} from './dto/chat.dto';

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

  // Text-to-Speech 客户端 (VertexAI)
  private readonly ttsClient: TextToSpeechClient;

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
      timeout: 1200000, // 设置 20 分钟超时 (适应 DeepSeek 深度思考的响应时间)
      maxRetries: 2, // 添加重试机制
    });

    // 初始化 Text-to-Speech 客户端
    this.ttsClient = new TextToSpeechClient({
      projectId: env.GCP_PROJECT_ID,
      keyFile: env.GCP_SERVICE_ACCOUNT_PATH,
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
      apiKey: env.GEMINI_API_KEY,
    });
  }

  /**
   * 处理 OpenAI API 错误的通用函数
   * @param error 错误对象
   * @param serviceName 服务名称（如 'DeepSeek', 'GPT'）
   */
  private handleOpenAIError(error: any, serviceName: string): never {
    // 如果已经是 BadRequestException，直接抛出
    if (error instanceof BadRequestException) {
      throw error;
    }

    this.logger.error(`${serviceName} 聊天请求失败`, {
      error: error.message,
      stack: error.stack,
      status: error.status,
      code: error.code,
      type: error.type,
      cause: error.cause,
    });

    // 检查超时错误
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      throw new BadRequestException(
        `${serviceName} 请求超时，请检查网络连接或重试`,
      );
    }

    // 检查连接错误
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      throw new BadRequestException(
        `${serviceName} 连接中断，请重试或联系管理员`,
      );
    }

    // 根据不同的错误类型返回更具体的错误信息
    if (error.status === 401) {
      throw new BadRequestException(
        `${serviceName} API 认证失败，请检查 API Key 是否正确`,
      );
    } else if (error.status === 403) {
      throw new BadRequestException(
        `${serviceName} 服务访问被拒绝，可能是账户余额不足或没有权限访问该模型`,
      );
    } else if (error.status === 429) {
      throw new BadRequestException(
        `${serviceName} API 调用频率超限，请稍后重试`,
      );
    } else if (error.status === 404) {
      throw new BadRequestException(`${serviceName} 模型不存在或名称错误`);
    } else if (error.status === 503 || error.status === 502) {
      throw new BadRequestException(
        `${serviceName} 服务暂时不可用，请稍后重试`,
      );
    } else if (error.status === 400) {
      throw new BadRequestException(
        `${serviceName} 请求参数错误: ${error.message}`,
      );
    } else {
      throw new BadRequestException(
        `${serviceName} 服务调用失败: ${error.message || '未知错误'}`,
      );
    }
  }

  /**
   * Gemini 文本聊天
   * @param prompt 用户输入的文本
   * @returns 包含内容和token统计的响应对象
   */
  async geminiChat(prompt: string): Promise<ChatResponseDto> {
    try {
      const startTime = Date.now();
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
            // 不再抛出错误，允许正常的响应被截断
            this.logger.warn('响应因达到 token 限制而被截断，但内容仍然有效');
            break;
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

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 获取 token 使用统计
      const usageMetadata = response.response?.usageMetadata;
      const usage = new TokenUsageDto();

      if (usageMetadata) {
        usage.promptTokens = usageMetadata.promptTokenCount || 0;
        usage.completionTokens = usageMetadata.candidatesTokenCount || 0;
        usage.totalTokens = usageMetadata.totalTokenCount || 0;
      } else {
        // 如果没有返回 token 统计，设置为 0
        usage.promptTokens = 0;
        usage.completionTokens = 0;
        usage.totalTokens = 0;
        this.logger.warn('Gemini 未返回 token 使用统计');
      }

      const result: ChatResponseDto = {
        content: text,
        usage,
        model: 'gemini-2.5-flash',
        responseTime,
      };

      this.logger.log(
        `Gemini 聊天成功，响应长度: ${text.length}, Token使用: ${usage.totalTokens}, 耗时: ${responseTime}ms`,
      );
      return result;
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
   * Gemini 流式聊天
   * @param prompt 用户输入的文本
   * @param onChunk 接收结构化数据块的回调函数
   */
  async geminiChatStream(
    prompt: string,
    onChunk: (data: {
      content: string;
      usage: TokenUsageDto;
      model: string;
      responseTime: number;
      isComplete: boolean;
    }) => void,
  ): Promise<void> {
    try {
      const startTime = Date.now();
      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      };

      this.logger.log(
        `开始 Gemini 流式聊天请求，prompt 长度: ${prompt.length}`,
      );

      // 使用 VertexAI 的流式 API
      const result = await this.genModel.generateContentStream(request);

      let fullText = '';
      const usage = new TokenUsageDto();

      for await (const chunk of result.stream) {
        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunkText) {
          fullText += chunkText;

          const currentTime = Date.now();
          const responseTime = currentTime - startTime;

          // 构建当前响应数据
          const responseData = {
            content: fullText,
            usage: {
              promptTokens: 0, // 流式中可能无法准确获取，暂时设为0
              completionTokens: Math.ceil(fullText.length / 4), // 粗略估算
              totalTokens: Math.ceil(fullText.length / 4),
            },
            model: 'gemini-2.5-flash',
            responseTime,
            isComplete: false, // 流式过程中都不是最终响应
          };

          onChunk(responseData);
        }
      }

      // 获取最终的 token 统计信息
      const finalResponse = await result.response;
      const usageMetadata = finalResponse?.usageMetadata;

      if (usageMetadata) {
        usage.promptTokens = usageMetadata.promptTokenCount || 0;
        usage.completionTokens = usageMetadata.candidatesTokenCount || 0;
        usage.totalTokens = usageMetadata.totalTokenCount || 0;
      } else {
        // 如果没有返回 token 统计，使用估算值
        usage.promptTokens = Math.ceil(prompt.length / 4);
        usage.completionTokens = Math.ceil(fullText.length / 4);
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
        this.logger.warn('Gemini 流式未返回 token 使用统计，使用估算值');
      }

      // 检查最终结果的安全性
      const candidates = finalResponse?.candidates;
      if (candidates && candidates.length > 0) {
        const firstCandidate = candidates[0];
        const finishReason = firstCandidate?.finishReason;

        if (finishReason && finishReason !== FinishReason.STOP) {
          this.logger.warn(`Gemini 流式响应异常结束: ${finishReason}`);

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
              // 不再抛出错误，允许正常的响应被截断
              this.logger.warn(
                '流式响应因达到 token 限制而被截断，但内容仍然有效',
              );
              break;
            case FinishReason.OTHER:
            default:
              throw new BadRequestException(
                `Gemini 响应异常: ${finishReason}，请稍后重试`,
              );
          }
        }
      }

      // 发送最终的完整响应
      const finalTime = Date.now();
      const finalResponseData = {
        content: fullText,
        usage,
        model: 'gemini-2.5-flash',
        responseTime: finalTime - startTime,
        isComplete: true, // 标记为最终响应
      };

      onChunk(finalResponseData);

      this.logger.log(
        `Gemini 流式聊天成功，总长度: ${fullText.length}, Token使用: ${usage.totalTokens}, 总耗时: ${finalTime - startTime}ms`,
      );
    } catch (error) {
      // 如果已经是 BadRequestException，直接抛出
      if (error instanceof BadRequestException) {
        throw error;
      }

      // 记录其他错误
      this.logger.error('Gemini 流式聊天请求失败', {
        error: error.message,
        stack: error.stack,
      });

      throw new BadRequestException(
        `Gemini 流式服务调用失败: ${error.message || '未知错误'}`,
      );
    }
  }

  /**
   * 文本转语音生成服务
   * 支持多种 TTS 提供商：Gemini TTS、MiniMax TTS
   * @param text 要合成的文本内容
   * @param voiceName 语音名称 (Gemini: 'Kore' 等, MiniMax: voice_id)
   * @param outputFile 输出文件名
   * @param provider TTS 提供商 ('gemini' | 'minimax')
   * @returns 音频文件的访问 URL
   */
  async generateVoiceFromText(
    text: string,
    voiceName = 'Kore',
    outputFile = 'out.wav',
    provider: string = 'gemini',
  ): Promise<string> {
    this.logger.log(
      `开始文本转语音，提供商: ${provider}, 文本长度: ${text.length}`,
    );

    if (provider === 'gemini') {
      return this.generateGeminiVoice(text, voiceName, outputFile);
    } else if (provider === 'minimax') {
      return this.generateMinimaxVoice(text, voiceName, outputFile);
    }

    throw new BadRequestException(
      `不支持的 TTS 提供商: ${provider}，支持的提供商: gemini, minimax`,
    );
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
   * DeepSeek 非流式聊天
   * @param prompt 用户输入的文本
   * @returns 包含内容和token统计的响应对象
   */
  async deepSeekChat(prompt: string): Promise<ChatResponseDto> {
    const startTime = Date.now();
    let timeoutWarning: NodeJS.Timeout | undefined;
    let timeoutError: NodeJS.Timeout | undefined;

    try {
      this.logger.log(`开始 DeepSeek 聊天请求，prompt 长度: ${prompt.length}`);

      // 添加超时监控定时器
      timeoutWarning = setTimeout(() => {
        this.logger.warn(`DeepSeek 请求已进行 2 分钟，仍在等待响应... 当前 prompt 长度: ${prompt.length}`);
      }, 2 * 60 * 1000); // 2分钟后警告

      timeoutError = setTimeout(() => {
        this.logger.error(`DeepSeek 请求超时，已等待 15 分钟...`);
        // 这里不抛出错误，只记录日志，让 OpenAI 客户端处理超时
      }, 15 * 60 * 1000); // 15分钟后错误日志

      this.logger.log(`发送 DeepSeek API 请求，超时设置为 20 分钟...`);

      const response = await this.openAIClient.chat.completions.create({
        model: 'deepseek/deepseek-v3.2',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: 65536, // DeepSeek 最大输出 token
        // 添加温度参数以控制随机性
        temperature: 0.7,
      }, {
        timeout: 1200000, // 20分钟超时（在选项中）
      });

      // 清除超时监控定时器
      if (timeoutWarning) clearTimeout(timeoutWarning);
      if (timeoutError) clearTimeout(timeoutError);

      this.logger.log(`DeepSeek API 响应已接收，开始处理...`);

      const content = response.choices?.[0]?.message?.content;
      if (!content || content.trim() === '') {
        this.logger.error('DeepSeek 返回了空响应', {
          response: JSON.stringify(response),
        });
        throw new BadRequestException('DeepSeek 返回了空响应，请重试');
      }

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 获取 token 使用统计
      const usage = new TokenUsageDto();
      const usageData = response.usage;

      if (usageData) {
        usage.promptTokens = usageData.prompt_tokens || 0;
        usage.completionTokens = usageData.completion_tokens || 0;
        usage.totalTokens = usageData.total_tokens || 0;
      } else {
        // 如果没有返回 token 统计，设置为 0
        usage.promptTokens = 0;
        usage.completionTokens = 0;
        usage.totalTokens = 0;
        this.logger.warn('DeepSeek 未返回 token 使用统计');
      }

      const result: ChatResponseDto = {
        content,
        usage,
        model: 'deepseek/deepseek-v3.2',
        responseTime,
      };

      this.logger.log(
        `DeepSeek 聊天成功，响应长度: ${content.length}, Token使用: ${usage.totalTokens}, 耗时: ${responseTime}ms`,
      );
      return result;
    } catch (error) {
      // 确保清除定时器（如果在 try 块中出错）
      if (timeoutWarning) clearTimeout(timeoutWarning);
      if (timeoutError) clearTimeout(timeoutError);

      this.logger.error('DeepSeek 请求异常', {
        error: error.message,
        stack: error.stack,
        type: error.constructor.name,
        code: error.code,
        duration: `${Date.now() - startTime}ms`
      });

      this.handleOpenAIError(error, 'DeepSeek');
    }
  }

  /**
   * GPT 非流式聊天（使用第三方服务商模型：pa/gpt-5.1）
   * @param prompt 用户输入的文本
   * @returns 包含内容和token统计的响应对象
   */
  async gptChat(prompt: string): Promise<ChatResponseDto> {
    try {
      const startTime = Date.now();
      this.logger.log(`开始 GPT 聊天请求，prompt 长度: ${prompt.length}`);

      const response = await this.openAIClient.chat.completions.create({
        model: 'pa/gpt-5.1',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: 128000, // GPT 最大输出 token
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content || content.trim() === '') {
        this.logger.error('GPT 返回了空响应', {
          response: JSON.stringify(response),
        });
        throw new BadRequestException('GPT 返回了空响应，请重试');
      }

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 获取 token 使用统计
      const usage = new TokenUsageDto();
      const usageData = response.usage;

      if (usageData) {
        usage.promptTokens = usageData.prompt_tokens || 0;
        usage.completionTokens = usageData.completion_tokens || 0;
        usage.totalTokens = usageData.total_tokens || 0;
      } else {
        // 如果没有返回 token 统计，设置为 0
        usage.promptTokens = 0;
        usage.completionTokens = 0;
        usage.totalTokens = 0;
        this.logger.warn('GPT 未返回 token 使用统计');
      }

      const result: ChatResponseDto = {
        content,
        usage,
        model: 'pa/gpt-5.1',
        responseTime,
      };

      this.logger.log(
        `GPT 聊天成功，响应长度: ${content.length}, Token使用: ${usage.totalTokens}, 耗时: ${responseTime}ms`,
      );
      return result;
    } catch (error) {
      this.handleOpenAIError(error, 'GPT');
    }
  }

  /**
   * DeepSeek 流式聊天
   * @param prompt 用户输入的文本
   * @param onChunk 接收结构化数据块的回调函数
   */
  async deepSeekChatStream(
    prompt: string,
    onChunk: (data: {
      content: string;
      usage: TokenUsageDto;
      model: string;
      responseTime: number;
      isComplete: boolean;
    }) => void,
  ): Promise<void> {
    try {
      const startTime = Date.now();
      this.logger.log(
        `开始 DeepSeek 流式聊天请求，prompt 长度: ${prompt.length}`,
      );

      const stream = await this.openAIClient.chat.completions.create({
        model: 'deepseek/deepseek-v3.2',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 65536, // DeepSeek 最大输出 token
        temperature: 0.7,
      });

      let fullText = '';
      let chunkCount = 0;

      for await (const chunk of stream) {
        chunkCount++;
        const content = chunk.choices?.[0]?.delta?.content;

        // 记录流式处理进度
        if (chunkCount % 50 === 0) {
          this.logger.debug(`DeepSeek 流式处理进度: 已接收 ${chunkCount} 个 chunk，当前长度: ${fullText.length}`);
        }

        if (content) {
          fullText += content;

          const currentTime = Date.now();
          const responseTime = currentTime - startTime;

          // 构建当前响应数据
          const responseData = {
            content: fullText,
            usage: {
              promptTokens: Math.ceil(prompt.length / 4), // 粗略估算
              completionTokens: Math.ceil(fullText.length / 4),
              totalTokens: Math.ceil((prompt.length + fullText.length) / 4),
            },
            model: 'deepseek/deepseek-v3.2',
            responseTime,
            isComplete: false, // 流式过程中都不是最终响应
          };

          onChunk(responseData);
        }
      }

      // 发送最终的完整响应
      const finalTime = Date.now();
      const finalResponseData = {
        content: fullText,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: Math.ceil(fullText.length / 4),
          totalTokens: Math.ceil((prompt.length + fullText.length) / 4),
        },
        model: 'deepseek/deepseek-v3.2',
        responseTime: finalTime - startTime,
        isComplete: true, // 标记为最终响应
      };

      onChunk(finalResponseData);

      this.logger.log(
        `DeepSeek 流式聊天成功，总长度: ${fullText.length}, 总耗时: ${finalTime - startTime}ms`,
      );
    } catch (error) {
      this.handleOpenAIError(error, 'DeepSeek');
    }
  }

  /**
   * GPT 流式聊天
   * @param prompt 用户输入的文本
   * @param onChunk 接收结构化数据块的回调函数
   */
  async gptChatStream(
    prompt: string,
    onChunk: (data: {
      content: string;
      usage: TokenUsageDto;
      model: string;
      responseTime: number;
      isComplete: boolean;
    }) => void,
  ): Promise<void> {
    try {
      const startTime = Date.now();
      this.logger.log(`开始 GPT 流式聊天请求，prompt 长度: ${prompt.length}`);

      const stream = await this.openAIClient.chat.completions.create({
        model: 'pa/gpt-5.1',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 128000, // GPT 最大输出 token
      });

      let fullText = '';

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;

          const currentTime = Date.now();
          const responseTime = currentTime - startTime;

          // 构建当前响应数据
          const responseData = {
            content: fullText,
            usage: {
              promptTokens: Math.ceil(prompt.length / 4), // 粗略估算
              completionTokens: Math.ceil(fullText.length / 4),
              totalTokens: Math.ceil((prompt.length + fullText.length) / 4),
            },
            model: 'pa/gpt-5.1',
            responseTime,
            isComplete: false, // 流式过程中都不是最终响应
          };

          onChunk(responseData);
        }
      }

      // 发送最终的完整响应
      const finalTime = Date.now();
      const finalResponseData = {
        content: fullText,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: Math.ceil(fullText.length / 4),
          totalTokens: Math.ceil((prompt.length + fullText.length) / 4),
        },
        model: 'pa/gpt-5.1',
        responseTime: finalTime - startTime,
        isComplete: true, // 标记为最终响应
      };

      onChunk(finalResponseData);

      this.logger.log(
        `GPT 流式聊天成功，总长度: ${fullText.length}, 总耗时: ${finalTime - startTime}ms`,
      );
    } catch (error) {
      this.handleOpenAIError(error, 'GPT');
    }
  }

  /**
   * 获取 VertexAI TTS 支持的语音列表
   * @returns 支持的语音列表
   */
  getVertexAIVoices() {
    return {
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
          {
            name: 'en-US-Standard-C',
            description: '美式女声 (标准语音)',
            gender: 'female',
          },
          {
            name: 'en-US-Standard-D',
            description: '美式男声 (标准语音)',
            gender: 'male',
          },
          {
            name: 'en-US-Standard-E',
            description: '美式女声 (标准语音)',
            gender: 'female',
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
          {
            name: 'en-US-Wavenet-C',
            description: '美式女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'en-US-Wavenet-D',
            description: '美式男声 (高品质 WaveNet)',
            gender: 'male',
          },
          {
            name: 'en-US-Wavenet-E',
            description: '美式女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'en-US-Wavenet-F',
            description: '美式男声 (高品质 WaveNet)',
            gender: 'male',
          },
          {
            name: 'en-US-Wavenet-H',
            description: '美式女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'en-US-Wavenet-I',
            description: '美式男声 (高品质 WaveNet)',
            gender: 'male',
          },
          {
            name: 'en-US-Wavenet-J',
            description: '美式女声 (高品质 WaveNet)',
            gender: 'female',
          },
        ],
      },
      japanese: {
        languageCode: 'ja-JP',
        standard: [
          {
            name: 'ja-JP-Standard-A',
            description: '日文女声 (标准语音)',
            gender: 'female',
          },
          {
            name: 'ja-JP-Standard-B',
            description: '日文男声 (标准语音)',
            gender: 'male',
          },
          {
            name: 'ja-JP-Standard-C',
            description: '日文女声 (标准语音)',
            gender: 'female',
          },
          {
            name: 'ja-JP-Standard-D',
            description: '日文男声 (标准语音)',
            gender: 'male',
          },
        ],
        wavenet: [
          {
            name: 'ja-JP-Wavenet-A',
            description: '日文女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'ja-JP-Wavenet-B',
            description: '日文男声 (高品质 WaveNet)',
            gender: 'male',
          },
          {
            name: 'ja-JP-Wavenet-C',
            description: '日文女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'ja-JP-Wavenet-D',
            description: '日文男声 (高品质 WaveNet)',
            gender: 'male',
          },
        ],
      },
      korean: {
        languageCode: 'ko-KR',
        standard: [
          {
            name: 'ko-KR-Standard-A',
            description: '韩文女声 (标准语音)',
            gender: 'female',
          },
          {
            name: 'ko-KR-Standard-B',
            description: '韩文男声 (标准语音)',
            gender: 'male',
          },
          {
            name: 'ko-KR-Standard-C',
            description: '韩文女声 (标准语音)',
            gender: 'female',
          },
          {
            name: 'ko-KR-Standard-D',
            description: '韩文男声 (标准语音)',
            gender: 'male',
          },
        ],
        wavenet: [
          {
            name: 'ko-KR-Wavenet-A',
            description: '韩文女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'ko-KR-Wavenet-B',
            description: '韩文男声 (高品质 WaveNet)',
            gender: 'male',
          },
          {
            name: 'ko-KR-Wavenet-C',
            description: '韩文女声 (高品质 WaveNet)',
            gender: 'female',
          },
          {
            name: 'ko-KR-Wavenet-D',
            description: '韩文男声 (高品质 WaveNet)',
            gender: 'male',
          },
        ],
      },
    };
  }

  /**
   * VertexAI TTS 语音合成
   * @param request TTS 请求参数
   * @returns 语音文件的访问地址和相关信息
   */
  async generateVertexAIVoice(
    request: VertexAiTTSRequestDto,
  ): Promise<VertexAITSResponseDto> {
    const startTime = Date.now();

    try {
      const {
        text,
        voiceName = 'cm-CN-Wavenet-A', // 默认使用中文 WaveNet 语音
        languageCode = 'zh-CN',
        speakingRate = 1.0,
        pitch = 0.0,
        outputFile = `vertexai-tts-${Date.now()}.wav`,
      } = request;

      this.logger.log(
        `开始 VertexAI TTS 语音合成，文本长度: ${text.length}, 语音: ${voiceName}`,
      );

      // 构建语音合成请求
      const ttsRequest = {
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'LINEAR16' as const,
          speakingRate,
          pitch,
          sampleRateHertz: 24000,
        },
      };

      // 调用 VertexAI Text-to-Speech API
      const [response] = await this.ttsClient.synthesizeSpeech(ttsRequest);

      if (!response.audioContent) {
        throw new Error('VertexAI TTS 未返回音频数据');
      }

      // 将音频内容转换为 Buffer
      const audioBuffer = Buffer.from(
        response.audioContent as string,
        'base64',
      );

      // 上传到 OSS
      const audioUrl = await this.uploadBufferToOss(audioBuffer, outputFile);

      const endTime = Date.now();
      const generationTime = endTime - startTime;

      const result: VertexAITSResponseDto = {
        audioUrl,
        voiceName,
        characterCount: text.length,
        generationTime,
        sampleRate: 24000,
      };

      this.logger.log(
        `VertexAI TTS 语音合成成功，字符数: ${text.length}, 耗时: ${generationTime}ms, 文件: ${outputFile}`,
      );

      return result;
    } catch (error) {
      this.logger.error('VertexAI TTS 语音合成失败', {
        error: error.message,
        stack: error.stack,
      });

      if (error.message?.includes('QUOTA_EXCEEDED')) {
        throw new BadRequestException(
          'VertexAI TTS 配额已用完，请稍后重试或升级配额',
        );
      } else if (error.message?.includes('PERMISSION_DENIED')) {
        throw new BadRequestException(
          'VertexAI TTS 权限不足，请检查服务账号权限',
        );
      } else if (error.message?.includes('INVALID_ARGUMENT')) {
        throw new BadRequestException(
          'VertexAI TTS 请求参数错误，请检查语音名称或语言代码',
        );
      } else {
        throw new BadRequestException(
          `VertexAI TTS 服务调用失败: ${error.message || '未知错误'}`,
        );
      }
    }
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
