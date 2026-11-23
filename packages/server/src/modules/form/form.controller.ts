/** 表单控制器：草稿 CRUD / 校验 / 一键发布 / Schema 导入导出 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FormSchema, SchemaEnvelope } from '@hengyida/shared';
import { AuthGuard } from '../auth/jwt.strategy';
import { CreateFormDto, ImportFormDto, PublishDto, SaveSchemaDto } from './dto';
import { FormService } from './form.service';

@ApiTags('表单')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('v1')
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post('apps/:appId/forms')
  @ApiOperation({ summary: '在应用下创建表单（R-003）' })
  async create(
    @Param('appId') appId: string,
    @Body() dto: CreateFormDto,
  ): Promise<unknown> {
    return this.formService.create(appId, dto.formId, dto.name);
  }

  // 静态路径先声明，避免被 forms/:id 捕获
  @Post('forms/import')
  @ApiOperation({ summary: '导入表单 Schema（R-002）' })
  async importSchema(@Body() dto: ImportFormDto): Promise<unknown> {
    return this.formService.importSchema(
      dto.envelope as unknown as SchemaEnvelope<FormSchema>,
    );
  }

  @Put('forms/:id/schema')
  @ApiOperation({ summary: '保存表单 Schema 草稿（R-003~R-008）' })
  async saveSchema(
    @Param('id') id: string,
    @Body() dto: SaveSchemaDto,
  ): Promise<unknown> {
    return this.formService.saveSchema(
      id,
      dto.schema as unknown as FormSchema,
    );
  }

  @Get('forms/:id/schema')
  @ApiOperation({ summary: '读取表单 Schema（默认草稿，published=1 读发布版）' })
  async getSchema(
    @Param('id') id: string,
    @Query('published') published?: string,
  ): Promise<unknown> {
    return published === '1'
      ? this.formService.getPublishedSchema(id)
      : this.formService.findById(id);
  }

  @Post('forms/:id/validate')
  @ApiOperation({ summary: '发布前校验（Ajv + 字段契约，R-017）' })
  async validate(@Param('id') id: string): Promise<unknown> {
    return this.formService.validate(id);
  }

  @Post('forms/:id/publish')
  @ApiOperation({ summary: '一键发布：校验→版本+1→幂等 DDL→保存 Schema（R-009/R-010）' })
  async publish(
    @Param('id') id: string,
    @Body() dto?: PublishDto,
  ): Promise<unknown> {
    const override = dto?.schema as unknown as FormSchema | undefined;
    return this.formService.publish(id, override);
  }

  @Post('forms/:id/export')
  @ApiOperation({ summary: '导出表单配置（R-002）' })
  async exportSchema(@Param('id') id: string): Promise<unknown> {
    return this.formService.exportSchema(id);
  }
}
