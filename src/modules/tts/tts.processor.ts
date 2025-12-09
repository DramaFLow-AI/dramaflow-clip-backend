import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { TtsTaskService } from './tts.service';
import { TtsJobData } from './types';
import { v4 as uuid } from 'uuid';

/** 任务状态常量 */
enum TaskStatus {
  PENDING = 0, // 待处理/失败但可重试
  SUCCESS = 1, // 成功
  FAILED = 2, // 最终失败
}

/** 方案状态常量 */
enum SchemeState {
  PROCESSING = 1, // 处理中
  SUCCESS = 2, // 成功（有成功任务）
  FAILED = 3, // 失败（全部失败）
}

@Processor('ttsQueue', {
  limiter: {
    max: 10, // 每分钟最多处理10个任务（RPM限制）
    duration: 60000, // 1分钟时间窗口
  },
})
export class TtsTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TtsTaskProcessor.name);

  constructor(
    private prisma: PrismaService,
    private chatService: ChatService,
    private ttsTaskService: TtsTaskService,
  ) {
    super();
  }

  /**
   * 处理 TTS 任务队列中的任务
   * @param job BullMQ 任务对象，包含 TTS 任务所需的所有参数
   * @returns 处理结果，包含成功状态和音频 URL
   */
  async process(job: Job<TtsJobData>) {
    const {
      taskId,
      text,
      schemeId,
      schemeIndex,
      segmentKey,
      voiceName,
      provider,
    } = job.data;

    this.logger.log(
      `开始处理 TTS 任务 [ID: ${taskId}] - 语音: ${voiceName}, 提供商: ${provider}`,
    );

    try {
      // 1. 验证任务存在性
      const existingTask = await this.prisma.sys_tts_task.findUnique({
        where: { id: Number(taskId) },
        select: { id: true },
      });
      if (!existingTask) {
        throw new Error(`任务 ID ${taskId} 不存在`);
      }

      // 2. 更新任务配置信息（语音名称和 TTS 模型）
      await this.prisma.sys_tts_task.update({
        where: { id: Number(taskId) },
        data: { voice_name: voiceName, tts_model: provider },
      });

      // 3. 调用文本转语音服务生成语音文件
      const audioUrl = await this.chatService.generateVoiceFromText(
        text,
        voiceName,
        `${uuid()}.wav`,
        provider,
      );

      // 4. 更新任务状态为成功
      await this.prisma.sys_tts_task.update({
        where: { id: Number(taskId) },
        data: {
          status: TaskStatus.SUCCESS,
          audio_url: audioUrl,
          retry_count: 0, // 成功时重置重试次数
          error_log: null, // 清空错误日志
        },
      });

      // 5. 更新方案中的音频信息
      await this.ttsTaskService.updateSegmentAudio(
        BigInt(schemeId),
        schemeIndex,
        segmentKey,
        audioUrl,
      );

      this.logger.log(
        `TTS 任务 [ID: ${taskId}] 处理成功，音频 URL: ${audioUrl}`,
      );
      return { success: true, audioUrl };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`TTS 任务 [ID: ${taskId}] 处理失败: ${errorMessage}`);

      // 增加重试计数并更新任务状态
      const currentTask = await this.prisma.sys_tts_task.findUnique({
        where: { id: Number(taskId) },
        select: { retry_count: true },
      });

      const newRetryCount = (currentTask?.retry_count || 0) + 1;

      await this.prisma.sys_tts_task.update({
        where: { id: Number(taskId) },
        data: {
          status: TaskStatus.PENDING, // 失败但可重试状态
          retry_count: newRetryCount,
          error_log: `第 ${newRetryCount} 次失败: ${errorMessage}`,
        },
      });

      throw error; // 重新抛出错误，让 BullMQ 处理重试逻辑
    }
  }

  /**
   * 检查方案下的所有任务是否已完成，并更新方案状态
   * @param schemeId 方案 ID
   */
  private async checkSchemeTasks(schemeId: bigint): Promise<void> {
    // 统计待处理的任务数量
    const unfinishedCount = await this.prisma.sys_tts_task.count({
      where: { scheme_id: schemeId, status: TaskStatus.PENDING },
    });

    this.logger.log(`方案 [ID: ${schemeId}] 待完成任务数: ${unfinishedCount}`);

    // 如果还有待处理的任务，直接返回
    if (unfinishedCount > 0) return;

    // 统计最终失败和成功的任务数量
    const failedCount = await this.prisma.sys_tts_task.count({
      where: { scheme_id: schemeId, status: TaskStatus.FAILED },
    });

    const successCount = await this.prisma.sys_tts_task.count({
      where: { scheme_id: schemeId, status: TaskStatus.SUCCESS },
    });

    const totalCompletedTasks = failedCount + successCount;

    // 如果没有已完成的任务，跳过状态更新
    if (totalCompletedTasks === 0) {
      this.logger.warn(`方案 [ID: ${schemeId}] 没有已完成的任务，跳过状态更新`);
      return;
    }

    // 确定方案最终状态
    // 注：根据业务逻辑，只要有任何失败任务，整个方案状态就是失败
    const finalState =
      failedCount > 0 ? SchemeState.FAILED : SchemeState.SUCCESS;

    // 更新方案状态
    await this.prisma.sys_generate_scheme_manage.update({
      where: { id: Number(schemeId) },
      data: { tts_task_state: finalState },
    });

    const statusDescription =
      finalState === SchemeState.SUCCESS ? '成功' : '失败';

    this.logger.log(
      `方案 [ID: ${schemeId}] 所有任务已完成 - 最终状态: ${statusDescription} (成功: ${successCount}, 失败: ${failedCount})`,
    );
  }

  /**
   * 任务完成事件处理
   * 当任务成功完成时触发，检查是否需要更新方案状态
   */
  @OnWorkerEvent('completed')
  async onCompleted(job: Job): Promise<void> {
    this.logger.log(`TTS 任务 [ID: ${job.id}] 已成功完成`);
    await this.checkSchemeTasks(BigInt(job.data.schemeId));
  }

  /**
   * 任务失败事件处理
   * 当任务最终失败（所有重试都用尽）时触发
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error): Promise<void> {
    this.logger.error(`TTS 任务 [ID: ${job.id}] 最终失败: ${err.message}`);

    // 将任务标记为最终失败状态
    await this.prisma.sys_tts_task.update({
      where: { id: Number(job.data.taskId) },
      data: {
        status: TaskStatus.FAILED,
        error_log: `最终失败: ${err.message}`,
      },
    });

    // 检查并更新方案状态
    await this.checkSchemeTasks(BigInt(job.data.schemeId));
  }
}
