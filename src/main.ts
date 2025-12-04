import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './common/swagger/swagger.config';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/config.type'; // 如果你有定义类型的话
import { setupUndiciProxy } from './utils/setupUndiciProxy';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/filters/http-response.interceptor';
import { WinstonModule } from 'nest-winston';
import { json, urlencoded } from 'express';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

// ✅ 这里加上 BigInt 的序列化方法
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// 设置代理
setupUndiciProxy();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        // 输出到控制台
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        // 错误日志：按日期轮转，保留 14 天
        new winston.transports.DailyRotateFile({
          dirname: 'logs',
          filename: 'error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m', // 单个文件最大 20MB
          maxFiles: '14d', // 保留最近 14 天
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        // 所有日志：按日期轮转，保留 7 天
        new winston.transports.DailyRotateFile({
          dirname: 'logs',
          filename: 'combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'info',
          maxSize: '20m', // 单个文件最大 20MB
          maxFiles: '7d', // 保留最近 7 天
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
  });

  // 允许跨域
  app.enableCors();

  // 增加请求体大小限制
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // 获取配置服务
  const config = app.get<ConfigService<AppConfig>>(ConfigService);

  // 注册全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());
  // 注册全局响应拦截器
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 注册全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // 自动类型转换（比如字符串 "1" 转成数字 1）
      whitelist: true, // 自动剔除 dto 中不存在的字段
      forbidNonWhitelisted: true, // 如果传了不存在的字段就报错
    }),
  );

  // 读取配置（比如端口）
  const port = config.get<number>('PORT') || 3000;

  // 初始化swagger
  setupSwagger(app);

  // 设置接口前缀
  app.setGlobalPrefix('api');

  await app.listen(port);
}
bootstrap();
