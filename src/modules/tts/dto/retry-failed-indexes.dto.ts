import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { sys_tts_task_segment_key } from '@prisma/client';

class FailedIndexDto {
  @ApiProperty({ description: '方案索引', example: 0 })
  @IsNumber({}, { message: 'schemeIndex 必须是数字' })
  schemeIndex: number;

  @ApiProperty({
    description: '片段 key',
    enum: sys_tts_task_segment_key,
    example: 'begin',
  })
  @IsEnum(sys_tts_task_segment_key, {
    message: 'segmentKey 必须是有效的枚举值',
  })
  segmentKey: sys_tts_task_segment_key;
}

/**
 * 根据索引重置任务请求DTO
 */
export class RetryFailedIndexesDto {
  @ApiProperty({ description: '方案 ID', example: 1 })
  @IsNumber({}, { message: 'schemeId 必须是数字' })
  schemeId: number;

  @ApiProperty({
    description: '失败的任务索引',
    type: [FailedIndexDto],
    example: [
      { schemeIndex: 0, segmentKey: 'begin' },
      { schemeIndex: 1, segmentKey: 'end' },
    ],
  })
  @IsArray({ message: 'failedIndexes 必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => FailedIndexDto)
  failedIndexes: FailedIndexDto[];

  @ApiProperty({
    description: '语音模型名称',
    example: 'Kore',
    default: 'Kore',
  })
  @IsString()
  voiceName: string = 'Kore';

  @ApiProperty({
    description: 'AI模型名称',
    example: 'Gemini',
  })
  @IsString()
  provider: string;
}
