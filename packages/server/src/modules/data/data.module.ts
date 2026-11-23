/** 数据模块：依赖表单模块（权限上下文）与权限模块（策略 + 引擎） */
import { Module } from '@nestjs/common';
import { DataEngine } from '../../core/data-engine';
import { FormulaEngine } from '../../core/formula-engine';
import { SchemaEngine } from '../../core/schema-engine';
import { FormModule } from '../form/form.module';
import { PermissionModule } from '../permission/permission.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';

@Module({
  imports: [FormModule, PermissionModule],
  controllers: [DataController],
  providers: [DataService, DataEngine, SchemaEngine, FormulaEngine],
})
export class DataModule {}
