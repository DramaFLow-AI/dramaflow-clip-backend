import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { sys_tts_task_segment_key } from '@prisma/client';

// 单个更新项 dto
export class UpdateTtsTaskItemDto {
  @ApiProperty({ description: '方案中的片段索引（从0开始）' })
  @IsInt()
  schemeIndex: number;

  @ApiProperty({ description: '片段 key', enum: sys_tts_task_segment_key })
  @IsNotEmpty()
  segmentKey: sys_tts_task_segment_key;

  @ApiProperty({ description: '新的翻译文案' })
  @IsString()
  @IsNotEmpty()
  newText: string;
}

// 批量更新 dto
export class UpdateTtsTasksDto {
  @ApiProperty({ description: '方案 ID' })
  @IsInt()
  schemeId: number;

  @ApiProperty({
    description: '要更新的任务列表',
    type: [UpdateTtsTaskItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateTtsTaskItemDto)
  updates: UpdateTtsTaskItemDto[];
}
