import { Global, Module } from '@nestjs/common';
import { OssService } from './oss.service';
import { OssController } from './oss.controller';

@Global()
@Module({
  controllers: [OssController],
  providers: [OssService],
  exports: [OssService],
})
export class OssModule {}
