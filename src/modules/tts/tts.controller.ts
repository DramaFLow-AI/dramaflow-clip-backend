import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { TtsTaskService } from './tts.service';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateTtsTaskDto, TaskExecuteDto } from './dto/create-tts-task.dto';
import { UpdateTtsTasksDto } from './dto/update-tts-task.dto';
import { RetryFailedIndexesDto } from './dto/retry-failed-indexes.dto';
import { GetStatusQueryDto, SegmentDto } from './dto/get-status-query.dto';
import { ApiResponseDto } from '../../common/decorators/api-response.decorator';
import { OverallResponseDto } from './dto/get-status-overall-status.dto';

@ApiTags('语音生成')
@Controller('tts-task')
export class TtsTaskController {
  constructor(private readonly service: TtsTaskService) {}

  @Post('create')
  @ApiOperation({
    summary: '创建语音生成任务',
    description: '创建语音生成队列',
  })
  @ApiResponseDto(TaskExecuteDto)
  async create(@Body() body: CreateTtsTaskDto) {
    return this.service.createTasks(
      body.schemeId,
      body.actualScheme,
      body.voiceName,
      body.provider,
    );
  }

  @Put('update')
  @ApiOperation({
    summary: '更新语音',
    description: '创建更新语音任务',
  })
  @ApiResponseDto(TaskExecuteDto)
  async updateTasks(@Body() dto: UpdateTtsTasksDto) {
    return this.service.updateTasksExclusive(dto.schemeId, dto.updates);
  }

  @Get('status')
  @ApiOperation({
    summary: '查询任务状态',
    description: '根据ID查询任务状态',
  })
  @ApiResponseDto(SegmentDto, true)
  async status(@Query() query: GetStatusQueryDto) {
    return this.service.getStatus(Number(query.schemeId));
  }

  @Get('overall-status')
  @ApiOperation({
    summary: '查询任务聚合状态',
    description: '根据ID查询任务聚合状态',
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
    return this.service.getOverallStatus(Number(schemeId));
  }

  @Post('retry')
  @ApiOperation({
    summary: '重试任务',
    description: '根据id和索引重试指定的任务',
  })
  async retry(@Body() body: RetryFailedIndexesDto) {
    return this.service.retryFailedTasks(
      body.schemeId,
      body.failedIndexes,
      body.voiceName,
      body.provider,
    );
  }
}
