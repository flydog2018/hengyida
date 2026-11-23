/** 权限模块：导出策略服务与权限引擎，供 data/form 模块复用 */
import { Module } from '@nestjs/common';
import { PermissionEngine } from '../../core/permission-engine';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';

@Module({
  controllers: [PermissionController],
  providers: [PermissionService, PermissionEngine],
  exports: [PermissionService, PermissionEngine],
})
export class PermissionModule {}
