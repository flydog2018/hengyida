/** 应用控制器：CRUD + 配置导入导出（全部需登录，写操作可再叠加角色策略） */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppConfig, FormSchema, SchemaEnvelope } from '@hengyida/shared';
import { AuthGuard } from '../auth/jwt.strategy';
import { CreateAppDto, ImportSchemaDto } from './dto';
import { ApplicationService } from './app.service';

@ApiTags('应用')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('v1/apps')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @ApiOperation({ summary: '创建应用（R-001）' })
  async create(@Body() dto: CreateAppDto): Promise<unknown> {
    return this.applicationService.create(dto.name, dto.description);
  }

  @Get()
  @ApiOperation({ summary: '应用列表' })
  async list(): Promise<unknown> {
    return this.applicationService.list();
  }

  // 静态路径必须声明在 :id 之前，避免被动态段捕获
  @Post('import')
  @ApiOperation({ summary: '导入配置 JSON（含版本迁移，R-002）' })
  async importSchema(@Body() dto: ImportSchemaDto): Promise<unknown> {
    return this.applicationService.importSchema(
      dto.envelope as unknown as SchemaEnvelope<{
        app: AppConfig;
        forms: FormSchema[];
      }>,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '应用详情' })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.applicationService.findById(id);
  }

  @Post(':id/export')
  @ApiOperation({ summary: '导出应用与其下全部表单配置（R-002）' })
  async exportSchema(@Param('id') id: string): Promise<unknown> {
    return this.applicationService.exportSchema(id);
  }
}
