// import { Module } from '@nestjs/common';
// import { BullModule } from '@nestjs/bullmq';
// import { TtsService } from './tts.service';
// import { TtsProcessor } from './tts.processor';
// import { PrismaService } from '../../prisma/prisma.service';
// import { ChatModule } from '../chat/chat.module';
// import { TtsController } from './tts.controller';
//
// @Module({
//   imports: [
//     BullModule.registerQueue({
//       name: 'ttsQueue',
//     }),
//     ChatModule,
//   ],
//   controllers: [TtsController],
//   providers: [TtsService, TtsProcessor, PrismaService, ChatModule],
// })
// export class TtsModule {}
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TtsTaskService } from './tts.service';
import { TtsTaskController } from './tts.controller';
import { TtsTaskProcessor } from './tts.processor';
import { ChatModule } from '../chat/chat.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ttsQueue',
      defaultJobOptions: {
        attempts: 3, // 最大重试次数
        backoff: {
          type: 'exponential', // 指数退避策略
          delay: 1000, // 初始延迟 1秒
        },
      },
    }),
    ChatModule,
  ],
  controllers: [TtsTaskController],
  providers: [TtsTaskService, TtsTaskProcessor, PrismaService],
})
export class TtsModule {}
