/**
 * 全局响应拦截器：把 Controller 返回值统一包装为 { code, data, message }（架构文档 7.4）。
 * code=0 表示成功；业务失败由 BusinessException + AllExceptionsFilter 输出非 0 code。
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ERROR_CODES } from '@hengyida/shared';

/** 统一响应体结构 */
export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data): ApiResponse<T> => {
        // 已按统一格式返回的直接透传，避免二次包裹（如部分透传第三方结果的场景）
        if (
          data !== null &&
          typeof data === 'object' &&
          'code' in (data as Record<string, unknown>) &&
          'message' in (data as Record<string, unknown>)
        ) {
          return data as unknown as ApiResponse<T>;
        }
        return { code: ERROR_CODES.OK, data, message: 'ok' };
      }),
    );
  }
}
