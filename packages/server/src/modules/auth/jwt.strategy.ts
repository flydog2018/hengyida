/**
 * 轻量认证守卫：项目未声明 passport，故不用 PassportStrategy。
 * 直接用 @nestjs/jwt 的 JwtService.verify 校验 Authorization: Bearer <token>。
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ERROR_CODES, type Role } from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';

/** JWT 载荷：角色随登录用户携带，不做客户端信任 */
export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  /** 可选：用户可访问的应用 id 列表 */
  appIds?: string[];
}

/** 已认证用户（挂载在 request.user） */
export type AuthenticatedUser = JwtPayload;

/** 带 user 的请求类型 */
export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new BusinessException(ERROR_CODES.UNAUTHORIZED, '缺少 Bearer Token', 401);
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new BusinessException(ERROR_CODES.UNAUTHORIZED, 'Token 为空', 401);
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (!payload?.sub || !payload?.role) {
        throw new Error('JWT 载荷缺少 sub 或 role');
      }
      request.user = payload;
      return true;
    } catch (err) {
      const expired =
        err instanceof Error && /expired|jwt expired/i.test(err.message);
      throw new BusinessException(
        expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.UNAUTHORIZED,
        expired ? '登录已过期，请重新登录' : 'Token 无效',
        401,
      );
    }
  }
}

/** 从请求中取已认证用户；守卫未运行或失败时抛 401 */
export function currentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.user) {
    throw new BusinessException(ERROR_CODES.UNAUTHORIZED, '未登录', 401);
  }
  return request.user;
}
