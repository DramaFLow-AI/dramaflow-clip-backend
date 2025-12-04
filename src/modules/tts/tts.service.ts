import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { DownloadContent, TtsJobData } from './types';
import { sys_tts_task_segment_key } from '@prisma/client';

/** 任务状态常量 */
enum TaskStatus {
  PENDING = 0, // 待处理
  SUCCESS = 1, // 成功
  FAILED = 2, // 失败
  DEPRECATED = 3, // 废弃
}

/** 方案状态常量 */
enum SchemeState {
  PROCESSING = 1, // 处理中
  SUCCESS = 2, // 成功
  FAILED = 3, // 失败
}

@Injectable()
export class TtsTaskService {
  private readonly logger = new Logger(TtsTaskService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('ttsQueue') private ttsQueue: Queue<TtsJobData>,
  ) {}

  /**
   * 方案锁机制：用 Map 保存每个 schemeId 的 Promise 链，保证同一方案的串行执行
   * 防止并发操作导致数据不一致问题
   */
  private schemeLocks = new Map<number, Promise<void>>();

  /**
   * 执行带锁的操作，确保同一方案的串行执行
   * @param schemeId 方案 ID
   * @param fn 要执行的函数
   */
  private async withLock(
    schemeId: number,
    fn: () => Promise<void>,
  ): Promise<void> {
    const prev = this.schemeLocks.get(schemeId) || Promise.resolve();
    const next = prev.then(fn).catch((err) => {
      this.logger.error(`方案锁执行出错 [schemeId=${schemeId}]`, err);
    });
    this.schemeLocks.set(schemeId, next);
    await next;
  }

  /**
   * 创建 TTS 任务
   * @param schemeId 方案 ID
   * @param actualScheme 实际方案数据数组
   * @param voiceName 语音名称
   * @param provider TTS 提供商
   * @param keepHistory 是否保留历史任务（默认 false，覆盖模式）
   * @returns 创建的任务统计信息
   */
  async createTasks(
    schemeId: number,
    actualScheme: any[],
    voiceName: string,
    provider: string,
    keepHistory: boolean = false,
  ) {
    this.logger.log(
      `开始创建 TTS 任务 [schemeId: ${schemeId}, keepHistory: ${keepHistory}]`,
    );

    // 1. 检查是否有未完成的任务，避免重复执行
    const unfinishedTask = await this.prisma.sys_tts_task.findFirst({
      where: {
        scheme_id: schemeId,
        status: TaskStatus.PENDING, // 待处理的任务
      },
    });

    if (unfinishedTask) {
      throw new ConflictException(
        `方案 ${schemeId} 已有任务正在执行，请等待完成后再重新生成`,
      );
    }

    // 2. 清空 BullMQ 队列中的旧任务，避免干扰
    const activeJobs = await this.ttsQueue.getJobs([
      'waiting',
      'delayed',
      'active',
    ]);
    const schemeJobs = activeJobs.filter(
      (job) => job.data.schemeId === schemeId,
    );

    for (const job of schemeJobs) {
      await job.remove();
    }

    this.logger.log(`已清理 ${schemeJobs.length} 个队列中的旧任务`);

    // 3. 更新方案状态为执行中
    await this.prisma.sys_generate_scheme_manage.update({
      where: { id: schemeId },
      data: { tts_task_state: SchemeState.PROCESSING },
    });

    // 4. 清空旧的音频 URL 数据
    await this.clearAudioUrls(schemeId);

    // 5. 创建新的 TTS 任务
    const createdTasks: any[] = [];
    const segmentKeys: sys_tts_task_segment_key[] = ['begin', 'middle', 'end'];

    for (let i = 0; i < actualScheme.length; i++) {
      const schemeItem = actualScheme[i];

      for (const segmentKey of segmentKeys) {
        const text =
          schemeItem.translation[
            segmentKey as keyof typeof schemeItem.translation
          ];

        if (keepHistory) {
          // 保留历史模式：标记旧任务为废弃
          await this.deprecateOldTasks(schemeId, i, segmentKey);
          const newTask = await this.createNewTask(
            schemeId,
            i,
            segmentKey,
            text,
          );
          await this.enqueueTask(
            newTask,
            text,
            schemeId,
            i,
            segmentKey,
            voiceName,
            provider,
          );
          createdTasks.push(newTask);
        } else {
          // 覆盖模式：删除旧任务，创建新任务
          await this.deleteOldTasks(schemeId, i, segmentKey);
          const newTask = await this.createNewTask(
            schemeId,
            i,
            segmentKey,
            text,
          );
          await this.enqueueTask(
            newTask,
            text,
            schemeId,
            i,
            segmentKey,
            voiceName,
            provider,
          );
          createdTasks.push(newTask);
        }
      }
    }

    this.logger.log(
      `成功创建 ${createdTasks.length} 个 TTS 任务 [schemeId: ${schemeId}]`,
    );
    return { totalTasks: createdTasks.length, schemeId };
  }

  /**
   * 清空方案中的音频 URL
   */
  private async clearAudioUrls(schemeId: number): Promise<void> {
    const record = await this.prisma.sys_generate_scheme_manage.findUnique({
      where: { id: schemeId },
      select: { download_content: true },
    });

    if (record?.download_content) {
      const downloadData = JSON.parse(
        record.download_content,
      ) as DownloadContent[];
      downloadData.forEach((item) => {
        item.audioUrl = {
          beginAudioUrl: '',
          middleAudioUrl: '',
          endAudioUrl: '',
        };
      });

      await this.prisma.sys_generate_scheme_manage.update({
        where: { id: schemeId },
        data: { download_content: JSON.stringify(downloadData) },
      });
    }
  }

  /**
   * 标记旧任务为废弃状态
   */
  private async deprecateOldTasks(
    schemeId: number,
    schemeIndex: number,
    segmentKey: sys_tts_task_segment_key,
  ): Promise<void> {
    await this.prisma.sys_tts_task.updateMany({
      where: {
        scheme_id: schemeId,
        scheme_index: schemeIndex,
        segment_key: segmentKey,
        status: {
          in: [TaskStatus.PENDING, TaskStatus.SUCCESS, TaskStatus.FAILED],
        },
      },
      data: {
        status: TaskStatus.DEPRECATED,
        error_log: '任务被覆盖，标记为废弃',
      },
    });
  }

  /**
   * 删除旧任务
   */
  private async deleteOldTasks(
    schemeId: number,
    schemeIndex: number,
    segmentKey: sys_tts_task_segment_key,
  ): Promise<void> {
    await this.prisma.sys_tts_task.deleteMany({
      where: {
        scheme_id: schemeId,
        scheme_index: schemeIndex,
        segment_key: segmentKey,
      },
    });
  }

  /**
   * 创建新的 TTS 任务
   */
  private async createNewTask(
    schemeId: number,
    schemeIndex: number,
    segmentKey: sys_tts_task_segment_key,
    text: string,
  ) {
    return await this.prisma.sys_tts_task.create({
      data: {
        scheme_id: schemeId,
        scheme_index: schemeIndex,
        segment_key: segmentKey,
        text_content: text,
        status: TaskStatus.PENDING,
        retry_count: 0,
      },
    });
  }

  /**
   * 将任务添加到队列
   */
  private async enqueueTask(
    task: any,
    text: string,
    schemeId: number,
    schemeIndex: number,
    segmentKey: sys_tts_task_segment_key,
    voiceName: string,
    provider: string,
  ): Promise<void> {
    await this.ttsQueue.add('generateAudio', {
      taskId: task.id.toString(),
      text,
      schemeId,
      schemeIndex,
      segmentKey,
      voiceName,
      provider,
    });
  }

  /**
   * 更新指定的 TTS 任务
   * @param schemeId 方案 ID
   * @param updates 更新内容数组
   * @returns 更新的任务统计信息
   */
  async updateTasksExclusive(
    schemeId: number,
    updates: {
      schemeIndex: number;
      segmentKey: sys_tts_task_segment_key;
      newText: string;
    }[],
  ) {
    this.logger.log(
      `开始更新 TTS 任务 [schemeId: ${schemeId}, 更新数量: ${updates.length}]`,
    );

    // 1. 检查是否有正在执行的任务，避免冲突
    const runningTask = await this.prisma.sys_tts_task.findFirst({
      where: {
        scheme_id: schemeId,
        status: { in: [TaskStatus.PENDING] }, // 进行中的任务
      },
    });

    if (runningTask) {
      throw new ConflictException(
        `方案 ${schemeId} 已有任务正在执行，请等待完成后再重新生成`,
      );
    }

    // 2. 查询语音配置信息，避免循环中重复查询
    const voiceConfig = await this.prisma.sys_tts_task.findFirst({
      where: { scheme_id: schemeId },
      select: { voice_name: true, tts_model: true },
    });
    const voiceName = voiceConfig?.voice_name ?? '';
    const ttsModel = voiceConfig?.tts_model ?? '';

    const updatedTasks: any[] = [];

    // 3. 逐个更新任务
    for (const { schemeIndex, segmentKey, newText } of updates) {
      // 检查任务是否存在
      const existingTask = await this.prisma.sys_tts_task.findUnique({
        where: {
          scheme_id_scheme_index_segment_key: {
            scheme_id: schemeId,
            scheme_index: schemeIndex,
            segment_key: segmentKey,
          },
        },
      });

      if (!existingTask) {
        throw new NotFoundException(
          `任务不存在: schemeId=${schemeId}, index=${schemeIndex}, key=${segmentKey}`,
        );
      }

      // 更新任务内容并重置状态
      const updatedTask = await this.prisma.sys_tts_task.update({
        where: { id: existingTask.id },
        data: {
          text_content: newText,
          retry_count: 0,
          status: TaskStatus.PENDING, // 重置为待执行状态
          audio_url: null, // 清空旧音频 URL
        },
      });

      // 更新方案状态为处理中
      await this.prisma.sys_generate_scheme_manage.update({
        where: { id: Number(schemeId) },
        data: { tts_task_state: SchemeState.PROCESSING },
      });

      // 重新加入队列进行处理
      await this.ttsQueue.add(
        'generateAudio',
        {
          taskId: updatedTask.id.toString(),
          text: newText,
          schemeId,
          schemeIndex,
          segmentKey,
          voiceName,
          provider: ttsModel,
        },
        {
          jobId: `tts-${updatedTask.id}-${Date.now()}`,
          removeOnComplete: true, // 完成后自动移除
          removeOnFail: false, // 失败时保留以便排查问题
        },
      );

      updatedTasks.push(updatedTask);
    }

    this.logger.log(
      `成功更新 ${updatedTasks.length} 个 TTS 任务 [schemeId: ${schemeId}]`,
    );
    return { totalTasks: updatedTasks.length, schemeId };
  }

  // 更新音频文件
  // async updateSegmentAudio(
  //   schemeId: bigint,
  //   schemeIndex: number,
  //   segmentKey: string,
  //   audioUrl: string,
  // ) {
  //   await this.withLock(Number(schemeId), async () => {
  //     const scheme = await this.prisma.sys_generate_scheme_manage.findUnique({
  //       where: { id: Number(schemeId) },
  //       select: { actual_scheme: true, download_content: true },
  //     });
  //     if (!scheme) throw new Error(`任务 ${schemeId} 不存在`);
  //
  //     const downloadContent = scheme.download_content;
  //     if (downloadContent !== null) {
  //       const downloadContentJSON = JSON.parse(downloadContent) as any[];
  //
  //       if (downloadContentJSON[schemeIndex]) {
  //         // 确保 audioUrl 是对象，并且初始化为空字段
  //         if (
  //           !downloadContentJSON[schemeIndex].audioUrl ||
  //           typeof downloadContentJSON[schemeIndex].audioUrl !== 'object' ||
  //           Array.isArray(downloadContentJSON[schemeIndex].audioUrl)
  //         ) {
  //           downloadContentJSON[schemeIndex].audioUrl = {
  //             beginAudioUrl: '',
  //             middleAudioUrl: '',
  //             endAudioUrl: '',
  //           };
  //         }
  //
  //         // 防止 audioUrl 被其他地方误改为数组或其它类型
  //         if (typeof downloadContentJSON[schemeIndex].audioUrl !== 'object') {
  //           downloadContentJSON[schemeIndex].audioUrl = {
  //             beginAudioUrl: '',
  //             middleAudioUrl: '',
  //             endAudioUrl: '',
  //           };
  //         }
  //
  //         // 这时候再安全赋值
  //         downloadContentJSON[schemeIndex].audioUrl[segmentKey + 'AudioUrl'] =
  //           audioUrl;
  //       } else {
  //         throw new Error(`Segment not found in actual_scheme`);
  //       }
  //
  //       await this.prisma.sys_generate_scheme_manage.update({
  //         where: { id: Number(schemeId) },
  //         data: { download_content: JSON.stringify(downloadContentJSON) },
  //       });
  //     }
  //   });
  // }
  /**
   * 更新方案中指定片段的音频文件 URL
   * 使用锁机制确保并发安全，只更新对应字段，保留原有内容
   * @param schemeId 方案 ID
   * @param schemeIndex 方案索引
   * @param segmentKey 片段键值
   * @param audioUrl 音频文件 URL
   */
  async updateSegmentAudio(
    schemeId: bigint,
    schemeIndex: number,
    segmentKey: string,
    audioUrl: string,
  ): Promise<void> {
    await this.withLock(Number(schemeId), async () => {
      // 查询方案信息
      const scheme = await this.prisma.sys_generate_scheme_manage.findUnique({
        where: { id: Number(schemeId) },
        select: { download_content: true },
      });

      if (!scheme) {
        throw new Error(`方案 ${schemeId} 不存在`);
      }

      if (!scheme.download_content) {
        this.logger.warn(
          `方案 ${schemeId} 的 download_content 为空，跳过音频 URL 更新`,
        );
        return;
      }

      try {
        // 解析下载内容 JSON
        const downloadContentData = JSON.parse(
          scheme.download_content,
        ) as any[];

        // 检查索引有效性
        if (!downloadContentData[schemeIndex]) {
          throw new Error(
            `片段索引超出范围: schemeId=${schemeId}, index=${schemeIndex}`,
          );
        }

        // 确保 audioUrl 对象存在且类型正确
        const segment = downloadContentData[schemeIndex];
        if (
          !segment.audioUrl ||
          typeof segment.audioUrl !== 'object' ||
          Array.isArray(segment.audioUrl)
        ) {
          segment.audioUrl = {};
        }

        // 只更新对应的音频字段，保留其他字段
        const audioFieldKey = `${segmentKey}AudioUrl`;
        segment.audioUrl[audioFieldKey] = audioUrl;

        // 保存更新后的数据
        await this.prisma.sys_generate_scheme_manage.update({
          where: { id: Number(schemeId) },
          data: { download_content: JSON.stringify(downloadContentData) },
        });

        this.logger.log(
          `已更新音频 URL [schemeId: ${schemeId}, index: ${schemeIndex}, key: ${audioFieldKey}]`,
        );
      } catch (error) {
        this.logger.error(
          `更新音频 URL 失败 [schemeId: ${schemeId}, index: ${schemeIndex}]`,
          error,
        );
        throw error;
      }
    });
  }

  /**
   * 查询方案的任务状态详情
   * @param schemeId 方案 ID
   * @returns 任务列表，包含解析后的下载内容
   */
  async getStatus(schemeId: number) {
    this.logger.log(`查询任务状态 [schemeId: ${schemeId}]`);

    // 查询所有相关任务
    const tasks = await this.prisma.sys_tts_task.findMany({
      where: { scheme_id: BigInt(schemeId) },
    });

    // 查询方案的下载内容配置
    const scheme = await this.prisma.sys_generate_scheme_manage.findUnique({
      where: { id: schemeId },
      select: { download_content: true },
    });

    // 解析并处理下载内容 JSON
    let parsedDownloadContent: any = null;

    if (scheme?.download_content) {
      try {
        // 解析主 JSON 数组
        const downloadArray: any[] = JSON.parse(scheme.download_content);

        // 对每个元素的 schemeContent 进行二次解析
        parsedDownloadContent = downloadArray.map((item) => {
          if (item.schemeContent && typeof item.schemeContent === 'string') {
            try {
              item.schemeContent = JSON.parse(item.schemeContent);
            } catch (parseError) {
              this.logger.error('解析 schemeContent 出错:', parseError);
              item.schemeContent = null;
            }
          }
          return item;
        });
      } catch (error) {
        this.logger.error('解析 download_content 出错:', error);
        parsedDownloadContent = null;
      }
    }

    // 返回任务数据与解析后的下载内容
    return tasks.map((task) => ({
      ...task,
      download_content: parsedDownloadContent,
    }));
  }

  /**
   * 查询方案的整体任务状态统计
   * @param schemeId 方案 ID
   * @returns 整体状态和各状态的任务数量统计
   */
  async getOverallStatus(schemeId: number): Promise<{
    overall: 'unfinished' | 'failed' | 'success';
    stats: {
      success: number;
      failed: number;
      unfinished: number;
      total: number;
    };
  }> {
    this.logger.log(`查询整体任务状态统计 [schemeId: ${schemeId}]`);

    // 查询所有任务的状态
    const tasks = await this.prisma.sys_tts_task.findMany({
      where: { scheme_id: BigInt(schemeId) },
      select: { status: true },
    });

    if (!tasks.length) {
      throw new BadRequestException(`方案 ${schemeId} 没有任务记录`);
    }

    // 统计各状态任务数量
    let successCount = 0;
    let failedCount = 0;
    let unfinishedCount = 0;

    for (const task of tasks) {
      switch (task.status) {
        case TaskStatus.SUCCESS:
          successCount++;
          break;
        case TaskStatus.FAILED:
          failedCount++;
          break;
        default:
          unfinishedCount++;
          break;
      }
    }

    // 确定整体状态
    let overallStatus: 'unfinished' | 'failed' | 'success';
    if (unfinishedCount > 0) {
      overallStatus = 'unfinished'; // 有待处理任务
    } else if (failedCount > 0) {
      overallStatus = 'failed'; // 没有待处理但有失败任务
    } else {
      overallStatus = 'success'; // 全部成功
    }

    const statusStats = {
      success: successCount,
      failed: failedCount,
      unfinished: unfinishedCount,
      total: tasks.length,
    };

    this.logger.log(
      `方案状态统计 [schemeId: ${schemeId}] - 整体状态: ${overallStatus}, ${JSON.stringify(statusStats)}`,
    );

    return {
      overall: overallStatus,
      stats: statusStats,
    };
  }

  /**
   * 重试指定的失败任务
   * @param schemeId 方案 ID
   * @param failedIndexes 失败任务的索引列表
   * @param voiceName 语音名称
   * @param provider TTS 提供商
   * @returns 重试的任务数量统计
   */
  async retryFailedTasks(
    schemeId: number,
    failedIndexes: any[],
    voiceName: string,
    provider: string,
  ) {
    this.logger.log(
      `开始重试失败任务 [schemeId: ${schemeId}, 任务数量: ${failedIndexes.length}]`,
    );

    let retriedCount = 0;

    for (const { schemeIndex, segmentKey } of failedIndexes) {
      try {
        // 使用 upsert 操作：存在则更新，不存在则创建
        const task = await this.prisma.sys_tts_task.upsert({
          where: {
            scheme_id_scheme_index_segment_key: {
              scheme_id: schemeId,
              scheme_index: schemeIndex,
              segment_key: segmentKey,
            },
          },
          update: {
            status: TaskStatus.PENDING, // 重置为待处理状态
            retry_count: { increment: 1 }, // 增加重试次数
            audio_url: null, // 清空音频 URL
            error_log: null, // 清空错误日志
          },
          create: {
            scheme_id: schemeId,
            scheme_index: schemeIndex,
            segment_key: segmentKey,
            text_content: '', // 如果原来不存在，创建一个空的占位任务
            status: TaskStatus.PENDING,
            retry_count: 1,
          },
        });

        // 重新将任务加入处理队列
        await this.ttsQueue.add('generateAudio', {
          taskId: task.id.toString(),
          text: task.text_content,
          schemeId,
          schemeIndex,
          segmentKey,
          voiceName,
          provider,
        });

        retriedCount++;
        this.logger.log(
          `已重试任务 [taskId: ${task.id}, index: ${schemeIndex}, key: ${segmentKey}]`,
        );
      } catch (error) {
        this.logger.error(
          `重试任务失败 [schemeId: ${schemeId}, index: ${schemeIndex}, key: ${segmentKey}]`,
          error,
        );
        // 继续处理其他任务，不因为单个失败而中断整个重试流程
      }
    }

    this.logger.log(`成功重试 ${retriedCount} 个任务 [schemeId: ${schemeId}]`);
    return { retried: retriedCount };
  }
}
