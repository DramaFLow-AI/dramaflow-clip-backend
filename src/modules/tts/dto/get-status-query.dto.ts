import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class GetStatusQueryDto {
  @ApiProperty({ description: '方案 ID', example: 1 })
  @IsNumberString({}, { message: 'schemeId 必须是数字字符串' })
  schemeId: string;
}

// ------------------------- 嵌套 dto -------------------------

export class TranslationDto {
  @ApiProperty({ description: 'begin 段英文翻译' })
  begin: string;

  @ApiProperty({ description: 'middle 段英文翻译' })
  middle: string;

  @ApiProperty({ description: 'end 段英文翻译' })
  end: string;
}

export class ChineseNarrationDto {
  @ApiProperty({ description: 'begin 段中文内容' })
  begin: string;

  @ApiProperty({ description: 'middle 段中文内容' })
  middle: string;

  @ApiProperty({ description: 'end 段中文内容' })
  end: string;
}

export class UsedSegmentDto {
  @ApiProperty({ description: '使用的分段 UID，例如 "1+2+3"' })
  segUid: string;

  @ApiProperty({ description: '对应每段音频时间，例如 "18秒,17秒,9秒"' })
  time: string;
}

export class SchemeContentDto {
  @ApiProperty({ description: '中文叙述内容' })
  chineseNarration: ChineseNarrationDto;

  @ApiProperty({ description: '中文总字数' })
  chineseWordCount: string;

  @ApiProperty({ description: '组合内容描述' })
  combinationContent: string;

  @ApiProperty({ description: '组合情绪' })
  combinationEmotion: string;

  @ApiProperty({ description: '组合逻辑描述' })
  combinationLogic: string;

  @ApiProperty({ description: '方案编号' })
  planNumber: string;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: '英文翻译' })
  translation: TranslationDto;

  @ApiProperty({ description: '已使用的分段信息' })
  usedSegment: UsedSegmentDto;

  @ApiProperty({ description: '视频总时长（秒）' })
  videoDurationSeconds: string;
}

export class AudioUrlDto {
  @ApiProperty({ description: 'begin 段音频 URL' })
  beginAudioUrl: string;

  @ApiProperty({ description: 'middle 段音频 URL' })
  middleAudioUrl: string;

  @ApiProperty({ description: 'end 段音频 URL' })
  endAudioUrl: string;
}

export class DownloadContentDto {
  @ApiProperty({ description: '方案编号' })
  planNumber: string;

  @ApiProperty({ description: '方案内容' })
  schemeContent: SchemeContentDto;

  @ApiProperty({ description: '音频 URL 对象' })
  audioUrl: AudioUrlDto;
}

/**
 * 获取状态响应DTO
 */
export class SegmentDto {
  @ApiProperty({ description: '唯一 ID' })
  id: string;

  @ApiProperty({ description: '方案 ID' })
  schemeId: string;

  @ApiProperty({ description: '方案索引' })
  schemeIndex: number;

  @ApiProperty({ description: '分段 key，例如 begin/middle/end' })
  segmentKey: string;

  @ApiProperty({ description: '文本内容' })
  textContent: string;

  @ApiProperty({ description: '音频 URL' })
  audioUrl: string;

  @ApiProperty({ description: '状态，1 成功、0 待处理、2 失败' })
  status: number;

  @ApiProperty({ description: '当前重试次数' })
  retryCount: number;

  @ApiProperty({ description: '最大重试次数' })
  maxRetry: number;

  @ApiProperty({ description: '错误日志', nullable: true })
  errorLog?: string;

  @ApiProperty({ description: '创建时间' })
  createTime: string;

  @ApiProperty({ description: '更新时间' })
  updateTime: string;

  @ApiProperty({ description: '使用的声音名称' })
  voiceName: string;

  @ApiProperty({ description: '下载内容数组', type: [DownloadContentDto] })
  downloadContent: DownloadContentDto[];
}
