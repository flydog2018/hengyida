/** 权限配置控制器：角色列表与策略读写 */
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERROR_CODES, type Role, type RolePolicy } from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import { AuthGuard } from '../auth/jwt.strategy';
import { PermissionService } from './permission.service';

/** 前端提交的策略体（role 由路径参数确定） */
export interface SavePolicyBody {
  apps: RolePolicy['apps'];
  forms: RolePolicy['forms'];
  rowRules?: RolePolicy['rowRules'];
}

const VALID_ROLES: Role[] = ['admin', 'editor', 'viewer'];

@ApiTags('权限')
@Controller('v1')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get('roles')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '列出管理员/编辑者/查看者三类角色及其策略' })
  async listRoles(): Promise<unknown> {
    return this.permissionService.listPolicies();
  }

  @Get('permissions/:roleId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询某角色的权限策略' })
  async getPolicy(@Param('roleId') roleId: string): Promise<unknown> {
    return this.permissionService.getPolicy(this.parseRole(roleId));
  }

  @Put('permissions/:roleId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '配置应用级/表单级/行级规则' })
  async savePolicy(
    @Param('roleId') roleId: string,
    @Body() body: SavePolicyBody,
  ): Promise<unknown> {
    const role = this.parseRole(roleId);
    const policy: RolePolicy = {
      role,
      apps: Array.isArray(body?.apps) ? body.apps : [],
      forms: Array.isArray(body?.forms) ? body.forms : [],
      rowRules: body?.rowRules ?? {},
    };
    return this.permissionService.savePolicy(role, policy);
  }

  /** 角色 id 合法性校验，防止把任意字符串写进 meta_policies */
  private parseRole(roleId: string): Role {
    const role = String(roleId ?? '') as Role;
    if (!VALID_ROLES.includes(role)) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `未知角色: ${roleId}`,
      );
    }
    return role;
  }
}
