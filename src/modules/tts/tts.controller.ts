import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { TtsTaskService } from './tts.service';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateTtsTaskDto, TaskExecuteDto } from './dto/create-tts-task.dto';
import { UpdateTtsTasksDto } from './dto/update-tts-task.dto';
import { RetryFailedIndexesDto } from './dto/retry-failed-indexes.dto';
import { GetStatusQueryDto, SegmentDto } from './dto/get-status-query.dto';
import { ApiResponseDto } from '../../common/decorators/api-response.decorator';
import { OverallResponseDto } from './dto/get-status-overall-status.dto';

/**
 * TTS 任务管理控制器
 * 提供语音合成任务的创建、更新、查询和重试功能
 */
@ApiTags('语音生成')
@Controller('tts-task')
export class TtsTaskController {
  private readonly logger = new Logger(TtsTaskController.name);

  constructor(private readonly ttsTaskService: TtsTaskService) {}

  /**
   * 创建语音生成任务
   * 根据方案数据批量创建 TTS 任务并加入处理队列
   */
  @Post('create')
  @ApiOperation({
    summary: '创建语音生成任务',
    description:
      '根据提供的方案数据批量创建语音合成任务，支持保留历史或覆盖模式两种创建方式',
  })
  @ApiResponseDto(TaskExecuteDto)
  async create(@Body() body: CreateTtsTaskDto) {
    this.logger.log(
      `创建 TTS 任务请求 [schemeId: ${body.schemeId}, provider: ${body.provider}]`,
    );

    const result = await this.ttsTaskService.createTasks(
      body.schemeId,
      body.actualScheme,
      body.voiceName,
      body.provider,
    );

    this.logger.log(
      `成功创建 ${result.totalTasks} 个 TTS 任务 [schemeId: ${body.schemeId}]`,
    );
    return result;
  }

  /**
   * 更新指定任务的语音内容
   * 重新生成指定片段的语音，支持批量更新
   */
  @Put('update')
  @ApiOperation({
    summary: '更新语音任务',
    description: '更新指定任务的文本内容并重新生成语音，支持同时更新多个任务',
  })
  @ApiResponseDto(TaskExecuteDto)
  async updateTasks(@Body() dto: UpdateTtsTasksDto) {
    this.logger.log(
      `更新 TTS 任务请求 [schemeId: ${dto.schemeId}, 更新数量: ${dto.updates.length}]`,
    );

    const result = await this.ttsTaskService.updateTasksExclusive(
      dto.schemeId,
      dto.updates,
    );

    this.logger.log(
      `成功更新 ${result.totalTasks} 个 TTS 任务 [schemeId: ${dto.schemeId}]`,
    );
    return result;
  }

  /**
   * 查询方案的详细任务状态
   * 返回所有任务的详细信息，包括下载内容和音频 URL
   */
  @Get('status')
  @ApiOperation({
    summary: '查询任务状态详情',
    description:
      '查询指定方案下所有 TTS 任务的详细状态信息，包括任务进度、音频 URL 等',
  })
  @ApiResponseDto(SegmentDto, true)
  async status(@Query() query: GetStatusQueryDto) {
    this.logger.log(`查询任务状态详情 [schemeId: ${query.schemeId}]`);

    const result = await this.ttsTaskService.getStatus(Number(query.schemeId));

    this.logger.log(
      `返回 ${result.length} 个任务的状态信息 [schemeId: ${query.schemeId}]`,
    );
    return result;
  }

  /**
   * 查询方案的整体任务状态统计
   * 返回各状态任务的数量统计和整体进度状态
   */
  @Get('overall-status')
  @ApiOperation({
    summary: '查询任务聚合状态',
    description:
      '查询指定方案的整体任务状态统计，包括成功、失败、待处理的任务数量',
  })
  @ApiQuery({
    name: 'schemeId',
    required: true,
    description: '方案 ID',
    type: String,
    example: '12345',
  })
  @ApiResponseDto(OverallResponseDto)
  async overallStatus(@Query('schemeId') schemeId: string) {
    this.logger.log(`查询整体任务状态 [schemeId: ${schemeId}]`);

    const result = await this.ttsTaskService.getOverallStatus(Number(schemeId));

    this.logger.log(
      `方案状态统计 [schemeId: ${schemeId}] - 整体状态: ${result.overall}, 总数: ${result.stats.total}`,
    );
    return result;
  }

  /**
   * 重试指定的失败任务
   * 将失败的任务重新加入处理队列，支持自定义语音配置
   */
  @Post('retry')
  @ApiOperation({
    summary: '重试失败任务',
    description:
      '将指定的失败任务重新加入处理队列，可以指定新的语音名称和提供商配置',
  })
  async retry(@Body() body: RetryFailedIndexesDto) {
    this.logger.log(
      `重试失败任务请求 [schemeId: ${body.schemeId}, 任务数量: ${body.failedIndexes.length}]`,
    );

    const result = await this.ttsTaskService.retryFailedTasks(
      body.schemeId,
      body.failedIndexes,
      body.voiceName,
      body.provider,
    );

    this.logger.log(
      `成功重试 ${result.retried} 个任务 [schemeId: ${body.schemeId}]`,
    );
    return result;
  }
}
