/**
 * 业务异常：携带统一错误码 code（架构文档 7.4 / 7.5）。
 * 全局异常过滤器读取 code + message，生成 { code, data, message } 响应。
 * 所有"可预期的业务失败"都应抛本异常，禁止直接抛裸 Error 给前端。
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ERROR_MESSAGES } from '@hengyida/shared';

export class BusinessException extends HttpException {
  /** 统一业务错误码，业务异常恒非 0 */
  readonly code: number;

  /**
   * @param code 统一错误码（取自 ERROR_CODES）
   * @param message 覆盖默认提示；缺省时使用 ERROR_MESSAGES 映射
   * @param httpStatus 覆盖推导出的 HTTP 状态码；缺省时按错误码分段推导
   */
  constructor(code: number, message?: string, httpStatus?: number) {
    const resolvedMessage = message ?? ERROR_MESSAGES[code] ?? '业务处理失败';
    super(resolvedMessage, httpStatus ?? BusinessException.inferHttpStatus(code));
    this.code = code;
  }

  /** 按错误码分段推导语义化 HTTP 状态码 */
  private static inferHttpStatus(code: number): number {
    // 2xxx 认证授权：未登录/过期 → 401，其余授权拒绝 → 403
    if (code >= 2000 && code < 3000) {
      return code === ERROR_CODES.UNAUTHORIZED || code === ERROR_CODES.TOKEN_EXPIRED
        ? HttpStatus.UNAUTHORIZED
        : HttpStatus.FORBIDDEN;
    }
    // 3xxx 配置类 → 400（配置不存在等场景语义上也可 404，统一按 400 处理）
    if (code >= 3000 && code < 4000) return HttpStatus.BAD_REQUEST;
    // 4xxx 数据校验 → 400
    if (code >= 4000 && code < 5000) return HttpStatus.BAD_REQUEST;
    // 5xxx 数据引擎/DDL → 500
    if (code >= 5000) return HttpStatus.INTERNAL_SERVER_ERROR;
    if (code === ERROR_CODES.NOT_FOUND) return HttpStatus.NOT_FOUND;
    return HttpStatus.BAD_REQUEST;
  }
}
