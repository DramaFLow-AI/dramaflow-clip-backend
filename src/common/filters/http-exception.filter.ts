import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// 简单日志写入函数（不依赖 winston）
// 注意：使用按日期轮转的日志文件名
function writeLog(content: string) {
  const logDir = path.join(process.cwd(), 'logs');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logFile = path.join(logDir, `error-${today}.log`);

  // 确保 logs 文件夹存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  // 追加写入
  fs.appendFileSync(logFile, content + '\n', { encoding: 'utf-8' });
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseData = exception.getResponse();

      if (typeof responseData === 'string') {
        message = responseData;
      } else if (
        typeof responseData === 'object' &&
        responseData !== null &&
        'message' in responseData
      ) {
        const msg = (responseData as { message: unknown }).message;
        message = Array.isArray(msg) ? String(msg[0]) : String(msg);
      } else {
        message = exception.message || message;
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    // 业务自定义错误提示映射（只针对通用 HTTP 错误）
    const httpMessageMap: Record<number, string> = {
      401: '未授权或登录过期',
      403: '禁止访问',
      404: '您请求的接口不存在',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务不可用',
      504: '网关超时',
    };

    // 对于 400 错误，优先使用业务层返回的具体错误信息
    // 对于其他 HTTP 错误，使用通用映射
    const finalMessage =
      status === 400 ? message : httpMessageMap[status] || message;

    // ====== 写入日志 ======
    let stack = '';
    if (exception instanceof Error) {
      stack = exception.stack || '';
    }

    const logContent = `[${new Date().toISOString()}] ${request.method} ${
      request.url
    } | ${status} | ${finalMessage} | ${stack}`;
    writeLog(logContent);

    // ====== 统一返回结构 ======
    response.status(status).json({
      code: status, // 错误码直接用 http 状态码
      msg: finalMessage, // 错误信息
      data: null, // 保持与成功接口结构一致
    });
  }
}
