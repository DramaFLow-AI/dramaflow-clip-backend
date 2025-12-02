import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/config';
import { BullModule } from '@nestjs/bullmq';
import { env } from './config/config';
import { PrismaModule } from './prisma/prisma.module';
import { OssModule } from './common/oss/oss.module';
import { ChatModule } from './modules/chat/chat.module';
import { MenuModule } from './modules/menu/menu.module';
import { TtsModule } from './modules/tts/tts.module';
import { UploadModule } from './modules/upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'dev'}`,
      validate: validateEnv, // Nest 会在 dotenv 加载后执行此函数
    }),
    BullModule.forRoot({
      connection: {
        host: env.REDIS_URL, // Redis 地址
        port: env.REDIS_PROT,
        password: env.REDIS_PASSWORD,
      },
    }),
    ConfigModule.forRoot({ isGlobal: true }), // 让 ConfigService 全局可用
    PrismaModule,
    OssModule,
    ChatModule,
    MenuModule,
    TtsModule,
    UploadModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
