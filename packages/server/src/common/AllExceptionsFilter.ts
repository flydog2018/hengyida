/**
 * 全局异常过滤器：任何异常都转换为统一响应 { code, data: null, message }。
 * 识别顺序：BusinessException → HttpException(Nest 内建) → FormulaError → 裸 Error → 未知。
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, ERROR_MESSAGES, FormulaError } from '@hengyida/shared';
import { BusinessException } from './BusinessException';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    let httpStatus: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = ERROR_CODES.INTERNAL;
    let message: string = ERROR_MESSAGES[ERROR_CODES.INTERNAL] ?? '服务器内部错误';

    if (exception instanceof BusinessException) {
      code = exception.code;
      message = exception.message;
      httpStatus = exception.getStatus();
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      code = this.codeFromHttpStatus(httpStatus);
      const payload = exception.getResponse();
      message =
        typeof payload === 'string' ? payload : this.extractMessage(payload);
    } else if (exception instanceof FormulaError) {
      code = ERROR_CODES.FORMULA_ERROR;
      message = exception.message;
      httpStatus = HttpStatus.BAD_REQUEST;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `${request.method} ${request.url} → ${exception.stack ?? message}`,
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url} → 未知异常: ${String(exception)}`,
      );
    }

    response.status(httpStatus).json({ code, data: null, message });
  }

  /** NestJS 内建 HTTP 异常 → 统一错误码 */
  private codeFromHttpStatus(status: number): number {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.BAD_REQUEST;
      default:
        return ERROR_CODES.INTERNAL;
    }
  }

  /** 兼容 class-validator 返回的 { message: string[] } 结构 */
  private extractMessage(payload: unknown): string {
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const value = (payload as { message: unknown }).message;
      if (Array.isArray(value)) return value.join('; ');
      if (typeof value === 'string') return value;
    }
    return ERROR_MESSAGES[ERROR_CODES.INTERNAL] ?? '服务器内部错误';
  }
}
