import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { TtsTaskService } from './tts.service';
import { TtsJobData } from './types';
import { v4 as uuid } from 'uuid';

@Processor('ttsQueue', {
  limiter: {
    max: 10, // RPM限制
    duration: 60000, // 1分钟
  },
})
export class TtsTaskProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private chatService: ChatService,
    private ttsTaskService: TtsTaskService,
  ) {
    super();
  }

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

    console.log('任务开始执行========================');
    console.log('voiceName:', voiceName);

    try {
      // 确认任务存在
      const task = await this.prisma.sys_tts_task.findUnique({
        where: { id: Number(taskId) },
        select: { id: true },
      });
      if (!task) {
        throw new Error(`任务 ${taskId} 不存在`);
      }

      // 更新 voiceName和tts_model
      await this.prisma.sys_tts_task.update({
        where: { id: Number(taskId) },
        data: { voice_name: voiceName, tts_model: provider },
      });

      // 调用 Gemini TTS 生成语音
      const audioUrl = await this.chatService.generateVoice(
        text,
        voiceName,
        `${uuid()}.wav`,
        provider,
      );

      // 成功：更新任务状态
      await this.prisma.sys_tts_task.update({
        where: { id: Number(taskId) },
        data: {
          status: 1, // 成功
          audio_url: audioUrl,
          retry_count: 0, // 成功时清零
          error_log: null,
        },
      });

      // 更新方案 JSON 字段
      await this.ttsTaskService.updateSegmentAudio(
        BigInt(schemeId),
        schemeIndex,
        segmentKey,
        audioUrl,
      );

      return { success: true, audioUrl };
    } catch (error: any) {
      const errMsg = error?.message || String(error);

      console.error(`[process] 任务 ${taskId} 失败: ${errMsg}`);

      // 每次失败，retry_count +1
      const task = await this.prisma.sys_tts_task.findUnique({
        where: { id: Number(taskId) },
        select: { retry_count: true },
      });

      const newRetryCount = (task?.retry_count || 0) + 1;

      await this.prisma.sys_tts_task.update({
        where: { id: Number(taskId) },
        data: {
          status: 0, // 失败但 BullMQ 会继续重试
          retry_count: newRetryCount,
          error_log: `第 ${newRetryCount} 次失败: ${errMsg}`,
        },
      });

      throw error; // 交给 BullMQ 判断是否还有重试
    }
  }

  /**
   * 公共方法：检查方案下的所有任务是否已完成，并更新方案状态
   */
  private async checkSchemeTasks(schemeId: bigint) {
    const unfinished = await this.prisma.sys_tts_task.count({
      where: { scheme_id: schemeId, status: 0 },
    });

    console.log(`[检查任务完成] schemeId=${schemeId}, 未完成=${unfinished}`);

    if (unfinished > 0) return;

    const failed = await this.prisma.sys_tts_task.count({
      where: { scheme_id: schemeId, status: 2 },
    });

    const success = await this.prisma.sys_tts_task.count({
      where: { scheme_id: schemeId, status: 1 },
    });

    const total = failed + success;

    if (total === 0) {
      console.log(`[检查任务完成] schemeId=${schemeId} 没有任务，跳过更新`);
      return;
    }

    // const newState = failed === total ? 3 : 2; // 全部失败=3，有成功=2
    const newState = failed > 1 ? 3 : 2; // 只要有一条失败，状态就为3，没有一条失败，就改为2，也就是成功

    await this.prisma.sys_generate_scheme_manage.update({
      where: { id: Number(schemeId) },
      data: { tts_task_state: newState },
    });

    console.log(
      `方案 ${schemeId} 所有任务已结束，状态=${newState === 2 ? '部分成功' : '全部失败'}`,
    );
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    await this.checkSchemeTasks(BigInt(job.data.schemeId));
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    console.error(`任务 ${job.id} 最终失败:`, err.message);

    // BullMQ 确认任务彻底失败 → 标记为最终失败
    await this.prisma.sys_tts_task.update({
      where: { id: Number(job.data.taskId) },
      data: {
        status: 2, // 最终失败
        error_log: `最终失败: ${err.message}`,
      },
    });

    await this.checkSchemeTasks(BigInt(job.data.schemeId));
  }
}
