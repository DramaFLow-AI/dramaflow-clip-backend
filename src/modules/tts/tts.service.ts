import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { DownloadContent, TtsJobData } from './types';
import { sys_tts_task_segment_key } from '@prisma/client';

@Injectable()
export class TtsTaskService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('ttsQueue') private ttsQueue: Queue<TtsJobData>,
  ) {}

  // 用 Map 保存每个 schemeId 的 Promise 链，保证串行
  private schemeLocks = new Map<number, Promise<void>>();

  private async withLock(schemeId: number, fn: () => Promise<void>) {
    const prev = this.schemeLocks.get(schemeId) || Promise.resolve();
    const next = prev.then(fn).catch((err) => {
      console.error(`[withLock] schemeId=${schemeId} 出错`, err);
    });
    this.schemeLocks.set(schemeId, next);
    await next;
  }

  // 创建任务
  async createTasks(
    schemeId: number,
    actualScheme: any[],
    voiceName: string,
    provider: string,
    keepHistory: boolean = false, // 默认保留历史
  ) {
    // 1. 检查是否有未完成任务
    const unfinished = await this.prisma.sys_tts_task.findFirst({
      where: {
        scheme_id: schemeId,
        status: 0, // 待处理的任务
      },
    });

    if (unfinished) {
      throw new ConflictException(
        `方案 ${schemeId} 已有任务正在执行，请等待完成后再重新生成`,
      );
    }

    // 2. 清空 BullMQ 队列，避免旧 Job 干扰
    const jobs = await this.ttsQueue.getJobs(['waiting', 'delayed', 'active']);
    const schemeJobs = jobs.filter((job) => job.data.schemeId === schemeId);
    for (const job of schemeJobs) {
      await job.remove();
    }

    // 3. 更新方案状态为执行中
    await this.prisma.sys_generate_scheme_manage.update({
      where: { id: schemeId },
      data: { tts_task_state: 1 },
    });

    // 4. 清空旧音频 URL
    const record = await this.prisma.sys_generate_scheme_manage.findUnique({
      where: { id: schemeId },
      select: { download_content: true },
    });

    if (record?.download_content) {
      const tempData = JSON.parse(record.download_content) as DownloadContent[];
      tempData.forEach((item) => {
        item.audioUrl = {
          beginAudioUrl: '',
          middleAudioUrl: '',
          endAudioUrl: '',
        };
      });
      await this.prisma.sys_generate_scheme_manage.update({
        where: { id: schemeId },
        data: { download_content: JSON.stringify(tempData) },
      });
    }

    // 5. 创建新任务
    const tasks: any[] = [];

    for (let i = 0; i < actualScheme.length; i++) {
      const item = actualScheme[i];
      const keys: ('begin' | 'middle' | 'end')[] = ['begin', 'middle', 'end'];

      for (const key of keys) {
        const text = item.translation[key];

        if (keepHistory) {
          // 方案一：保留历史 -> 标记旧任务为废弃
          await this.prisma.sys_tts_task.updateMany({
            where: {
              scheme_id: schemeId,
              scheme_index: i,
              segment_key: key,
              status: { in: [0, 1, 2] }, // 待处理/成功/失败的任务
            },
            data: {
              status: 3, // 废弃
              error_log: '任务被覆盖，标记为废弃',
            },
          });

          // 创建新任务
          const task = await this.prisma.sys_tts_task.create({
            data: {
              scheme_id: schemeId,
              scheme_index: i,
              segment_key: key,
              text_content: text,
              status: 0,
              retry_count: 0,
            },
          });

          // 添加到队列
          await this.ttsQueue.add('generateAudio', {
            taskId: task.id.toString(),
            text,
            schemeId,
            schemeIndex: i,
            segmentKey: key,
            voiceName,
            provider,
          });

          tasks.push(task);
        } else {
          // 方案二：覆盖模式 -> 删除旧任务
          await this.prisma.sys_tts_task.deleteMany({
            where: {
              scheme_id: schemeId,
              scheme_index: i,
              segment_key: key,
            },
          });

          const task = await this.prisma.sys_tts_task.create({
            data: {
              scheme_id: schemeId,
              scheme_index: i,
              segment_key: key,
              text_content: text,
              status: 0,
              retry_count: 0,
            },
          });

          await this.ttsQueue.add('generateAudio', {
            taskId: task.id.toString(),
            text,
            schemeId,
            schemeIndex: i,
            segmentKey: key,
            voiceName,
            provider,
          });

          tasks.push(task);
        }
      }
    }

    return { totalTasks: tasks.length, schemeId };
  }

  // 更新指定数据
  async updateTasksExclusive(
    schemeId: number,
    updates: {
      schemeIndex: number;
      segmentKey: sys_tts_task_segment_key;
      newText: string;
    }[],
  ) {
    // 1. 检查是否有未完成任务
    const running = await this.prisma.sys_tts_task.findFirst({
      where: {
        scheme_id: schemeId,
        status: { in: [0] }, // 0=进行中
      },
    });

    if (running) {
      throw new ConflictException(
        `方案 ${schemeId} 已有任务正在执行，请等待完成后再重新生成`,
      );
    }

    // 储存任务队列
    const tasks: any[] = [];

    // 2. 查询一次 voice 信息，避免循环里多次查库
    const voiceRecord = await this.prisma.sys_tts_task.findFirst({
      where: { scheme_id: schemeId },
      select: { voice_name: true, tts_model: true },
    });
    const voiceName = voiceRecord?.voice_name ?? '';
    const ttsModel = voiceRecord?.tts_model ?? '';

    for (const { schemeIndex, segmentKey, newText } of updates) {
      const existing = await this.prisma.sys_tts_task.findUnique({
        where: {
          scheme_id_scheme_index_segment_key: {
            scheme_id: schemeId,
            scheme_index: schemeIndex,
            segment_key: segmentKey,
          },
        },
      });

      if (!existing) {
        throw new NotFoundException(
          `任务不存在: schemeId=${schemeId}, index=${schemeIndex}, key=${segmentKey}`,
        );
      }

      // 更新任务记录
      const updated = await this.prisma.sys_tts_task.update({
        where: { id: existing.id },
        data: {
          text_content: newText,
          retry_count: 0,
          status: 0, // 重置为待执行
          audio_url: null,
        },
      });
      // 更新解说记录任务执行状态
      await this.prisma.sys_generate_scheme_manage.update({
        where: { id: Number(schemeId) },
        data: {
          tts_task_state: 1,
        },
      });

      // 入队生成任务
      await this.ttsQueue.add(
        'generateAudio',
        {
          taskId: updated.id.toString(),
          text: newText,
          schemeId,
          schemeIndex,
          segmentKey,
          voiceName,
          provider: ttsModel,
        },
        {
          jobId: `tts-${updated.id}-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      tasks.push(updated);
    }

    return { totalTasks: tasks.length, schemeId };
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
  // 更新音频文件（只更新对应字段，不清空原有内容）
  async updateSegmentAudio(
    schemeId: bigint,
    schemeIndex: number,
    segmentKey: string,
    audioUrl: string,
  ) {
    await this.withLock(Number(schemeId), async () => {
      const scheme = await this.prisma.sys_generate_scheme_manage.findUnique({
        where: { id: Number(schemeId) },
        select: { download_content: true },
      });
      if (!scheme) throw new Error(`任务 ${schemeId} 不存在`);

      if (scheme.download_content) {
        const downloadContentJSON = JSON.parse(
          scheme.download_content,
        ) as any[];

        if (!downloadContentJSON[schemeIndex]) {
          throw new Error(
            `Segment not found: schemeId=${schemeId}, index=${schemeIndex}`,
          );
        }

        // 确保 audioUrl 存在且为对象（保留已有内容）
        if (
          !downloadContentJSON[schemeIndex].audioUrl ||
          typeof downloadContentJSON[schemeIndex].audioUrl !== 'object' ||
          Array.isArray(downloadContentJSON[schemeIndex].audioUrl)
        ) {
          downloadContentJSON[schemeIndex].audioUrl = {};
        }

        // 只更新对应字段
        downloadContentJSON[schemeIndex].audioUrl[`${segmentKey}AudioUrl`] =
          audioUrl;

        // 更新 DB
        await this.prisma.sys_generate_scheme_manage.update({
          where: { id: Number(schemeId) },
          data: { download_content: JSON.stringify(downloadContentJSON) },
        });
      }
    });
  }

  // 查询任务状态
  async getStatus(schemeId: number) {
    // 查询任务
    const tasks = await this.prisma.sys_tts_task.findMany({
      where: { scheme_id: BigInt(schemeId) },
    });

    // 查询方案的 download_content
    const scheme = await this.prisma.sys_generate_scheme_manage.findUnique({
      where: { id: schemeId },
      select: { download_content: true },
    });

    // 扁平化并解析 JSON，包括 schemeContent 二次解析
    return tasks.map((task) => {
      let downloadContent: any = null;

      if (scheme?.download_content) {
        try {
          // 先解析成数组
          const parsedArray: any[] = JSON.parse(scheme.download_content);

          // 遍历数组，对每个元素的 schemeContent 进行二次解析
          downloadContent = parsedArray.map((item) => {
            if (item.schemeContent && typeof item.schemeContent === 'string') {
              try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                item.schemeContent = JSON.parse(item.schemeContent);
              } catch (err) {
                console.error('解析 schemeContent 出错:', err);
                item.schemeContent = null;
              }
            }
            return item;
          });
        } catch (err) {
          console.error('解析 download_content 出错:', err);
          downloadContent = null;
        }
      }

      return {
        ...task,
        download_content: downloadContent,
      };
    });
  }

  // 查询整体任务状态 + 各状态数量
  async getOverallStatus(schemeId: number): Promise<{
    overall: 'unfinished' | 'failed' | 'success';
    stats: {
      success: number;
      failed: number;
      unfinished: number;
      total: number;
    };
  }> {
    const tasks = await this.prisma.sys_tts_task.findMany({
      where: { scheme_id: BigInt(schemeId) },
      select: { status: true },
    });

    if (!tasks.length) {
      throw new BadRequestException(`方案 ${schemeId} 没有任务记录`);
    }

    let success = 0;
    let failed = 0;
    let unfinished = 0;

    for (const t of tasks) {
      if (t.status === 1) success++;
      else if (t.status === 2) failed++;
      else unfinished++;
    }

    let overall: 'unfinished' | 'failed' | 'success';
    if (unfinished > 0) {
      overall = 'unfinished';
    } else if (failed > 0) {
      overall = 'failed';
    } else {
      overall = 'success';
    }

    return {
      overall,
      stats: {
        success,
        failed,
        unfinished,
        total: tasks.length,
      },
    };
  }

  // 重试失败任务
  async retryFailedTasks(
    schemeId: number,
    failedIndexes: any[],
    voiceName: string,
    provider: string,
  ) {
    let count = 0;

    for (const { schemeIndex, segmentKey } of failedIndexes) {
      const task = await this.prisma.sys_tts_task.upsert({
        where: {
          scheme_id_scheme_index_segment_key: {
            scheme_id: schemeId,
            scheme_index: schemeIndex,
            segment_key: segmentKey,
          },
        },
        update: {
          status: 0,
          retry_count: { increment: 1 },
          audio_url: null,
          error_log: null,
        },
        create: {
          scheme_id: schemeId,
          scheme_index: schemeIndex,
          segment_key: segmentKey,
          text_content: '', // 如果原来不存在，就建一个空的占位
          status: 0,
          retry_count: 1,
        },
      });

      // 重新入队
      await this.ttsQueue.add('generateAudio', {
        taskId: task.id.toString(),
        text: task.text_content,
        schemeId,
        schemeIndex,
        segmentKey,
        voiceName,
        provider,
      });

      count++;
    }

    return { retried: count };
  }
}
