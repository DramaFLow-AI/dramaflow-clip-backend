import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { UploadFileResponseDto } from './dto/upload-file-response.dto';
import { ApiResponseDto } from '../../common/decorators/api-response.decorator';

@ApiTags('文件上传')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @ApiOperation({ summary: '上传单个文件到 OSS' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: '文件上传', type: UploadFileDto })
  @ApiResponseDto(UploadFileResponseDto)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException('没有检测到上传文件');
      }

      const result = await this.uploadService.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      return {
        ...result,
      };
    } catch (error) {
      // eslint-safe 写法，和你其他接口风格一致
      console.error('[uploadFile]', error);
      throw error;
    }
  }
}
