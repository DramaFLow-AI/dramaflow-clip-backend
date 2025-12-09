import { ApiProperty } from '@nestjs/swagger';

/**
 * 统计信息 dto
 */
export class StatsDto {
  @ApiProperty({ description: '成功数量' })
  success: number;

  @ApiProperty({ description: '失败数量' })
  failed: number;

  @ApiProperty({ description: '未完成数量' })
  unfinished: number;

  @ApiProperty({ description: '总数' })
  total: number;
}

/**
 * 总体响应 dto
 */
export class OverallResponseDto {
  @ApiProperty({ description: '总体状态，例如 success/fail' })
  overall: string;

  @ApiProperty({ description: '统计信息', type: StatsDto })
  stats: StatsDto;
}
