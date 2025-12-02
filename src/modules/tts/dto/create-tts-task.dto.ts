import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, IsString, IsNumber } from 'class-validator';
import { Transform, Type } from 'class-transformer';

class TranslationDto {
  @ApiProperty({ description: '开头文本', example: 'Hello' })
  @IsString({ message: 'begin 必须是字符串' })
  begin: string;

  @ApiProperty({ description: '中间文本', example: 'world' })
  @IsString({ message: 'middle 必须是字符串' })
  middle: string;

  @ApiProperty({ description: '结尾文本', example: '!' })
  @IsString({ message: 'end 必须是字符串' })
  end: string;
}

class ActualSchemeDto {
  @ApiProperty({ description: '翻译内容', type: TranslationDto })
  @ValidateNested()
  @Type(() => TranslationDto)
  translation: TranslationDto;
}

/**
 * 任务执行结果DTO
 */
export class TaskExecuteDto {
  @ApiProperty({ description: '执行任务的总数' })
  totalTasks: number;

  @ApiProperty({ description: '当前执行的方案id' })
  schemeId: number;
}

/**
 * 创建任务请求DTO
 */
export class CreateTtsTaskDto {
  @ApiProperty({ description: '方案 ID', example: 1 })
  @IsNumber({}, { message: 'schemeId 必须是数字' })
  schemeId: number;

  @ApiProperty({
    description: '实际方案数组',
    type: [ActualSchemeDto],
    example: [
      { translation: { begin: 'Hello', middle: 'world', end: '!' } },
      { translation: { begin: 'Good', middle: 'morning', end: '.' } },
    ],
  })
  @IsArray({ message: 'actualScheme 必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => ActualSchemeDto)
  actualScheme: ActualSchemeDto[];

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
  @Transform(({ value }) => value.toLowerCase())
  provider: string;
}
