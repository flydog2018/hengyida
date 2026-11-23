/** 表单模块：导出 FormService 供 data 模块做权限上下文查询 */
import { Module } from '@nestjs/common';
import { DataEngine } from '../../core/data-engine';
import { SchemaEngine } from '../../core/schema-engine';
import { FormService } from './form.service';
import { FormController } from './form.controller';

@Module({
  controllers: [FormController],
  providers: [FormService, SchemaEngine, DataEngine],
  exports: [FormService],
})
export class FormModule {}
