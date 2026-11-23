/** 应用业务模块（区别于根模块 AppModule，命名 ApplicationModule 避免冲突） */
import { Module } from '@nestjs/common';
import { SchemaEngine } from '../../core/schema-engine';
import { ApplicationService } from './app.service';
import { ApplicationController } from './app.controller';

@Module({
  controllers: [ApplicationController],
  providers: [ApplicationService, SchemaEngine],
  exports: [ApplicationService],
})
export class ApplicationModule {}
