/** 数据控制器：CRUD + 列表查询（R-011/R-012 基础，Excel 归波次2） */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  DataQuery,
  FilterCondition,
  SortItem,
} from '@hengyida/shared';
import { AuthGuard, currentUser, type AuthenticatedRequest } from '../auth/jwt.strategy';
import { ValuesDto } from './dto';
import { DataService } from './data.service';

@ApiTags('数据')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('v1/data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get(':formKey')
  @ApiOperation({ summary: '列表查询：filters/sort 传 JSON 字符串，支持分页与行级权限' })
  async list(
    @Param('formKey') formKey: string,
    @Query() query: Record<string, string | string[] | undefined>,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.dataService.list(
      formKey,
      this.parseQuery(query),
      currentUser(request),
    );
  }

  @Post(':formKey')
  @ApiOperation({ summary: '新增记录（服务端公式/校验/权限权威计算，R-005/R-008/R-013）' })
  async create(
    @Param('formKey') formKey: string,
    @Body() dto: ValuesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.dataService.create(
      formKey,
      dto.values ?? {},
      currentUser(request),
    );
  }

  @Get(':formKey/:recordId')
  @ApiOperation({ summary: '记录详情（行级权限过滤）' })
  async findOne(
    @Param('formKey') formKey: string,
    @Param('recordId') recordId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.dataService.findOne(formKey, recordId, currentUser(request));
  }

  @Put(':formKey/:recordId')
  @ApiOperation({ summary: '更新记录（重新执行权威公式与校验）' })
  async update(
    @Param('formKey') formKey: string,
    @Param('recordId') recordId: string,
    @Body() dto: ValuesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.dataService.update(
      formKey,
      recordId,
      dto.values ?? {},
      currentUser(request),
    );
  }

  @Delete(':formKey/:recordId')
  @ApiOperation({ summary: '删除记录（行级权限校验）' })
  async remove(
    @Param('formKey') formKey: string,
    @Param('recordId') recordId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.dataService.remove(formKey, recordId, currentUser(request));
  }

  /** 查询参数解析：filters/sort 为 JSON 字符串，非法输入回退默认值 */
  private parseQuery(query: Record<string, string | string[] | undefined>): DataQuery {
    const readJson = <T>(raw: unknown, fallback: T): T => {
      if (typeof raw !== 'string' || raw.trim() === '') return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    };
    const positiveInt = (raw: unknown, fallback: number): number => {
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : fallback;
    };
    return {
      filters: readJson<FilterCondition[]>(query.filters, []),
      sort: readJson<SortItem[]>(query.sort, []),
      page: positiveInt(query.page, 1),
      pageSize: positiveInt(query.pageSize, 20),
    };
  }
}
