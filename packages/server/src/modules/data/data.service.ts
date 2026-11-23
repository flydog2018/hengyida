/**
 * 数据服务（R-005/R-008/R-011/R-013）：全功能数据 CRUD + 服务端权威填报链路。
 * 填报严格按序：权限判定 → 公式计算 → 显示条件 → 数据校验 → 行级写校验 → 落库。
 * 客户端传来的公式字段值、校验结果、权限声明一律不作落库依据。
 */
import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type Action,
  type DataQuery,
  type FieldSchema,
  type FormSchema,
  type PermissionContext,
  type RolePolicy,
  type RuntimeRecord,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import { DataEngine } from '../../core/data-engine';
import { FormulaEngine } from '../../core/formula-engine';
import {
  PermissionEngine,
  type PermissionDecision,
} from '../../core/permission-engine';
import { SchemaEngine } from '../../core/schema-engine';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { FormService } from '../form/form.service';
import { PermissionService } from '../permission/permission.service';

/** 一次已授权的上下文 */
interface AuthorizedContext {
  schema: FormSchema;
  appId: string;
  policy: RolePolicy;
  context: PermissionContext;
  decision: PermissionDecision;
}

@Injectable()
export class DataService {
  constructor(
    private readonly formService: FormService,
    private readonly dataEngine: DataEngine,
    private readonly schemaEngine: SchemaEngine,
    private readonly formulaEngine: FormulaEngine,
    private readonly permissionEngine: PermissionEngine,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * 统一授权入口：认证(JWT, 守卫已做) → 应用级 → 表单级 → 行级 → 字段级。
   * 前三级由 PermissionEngine.authorize 短路判定，行级谓词随 decision 返回。
   */
  private async authorize(
    user: AuthenticatedUser,
    formId: string,
    action: Action,
  ): Promise<AuthorizedContext> {
    const { schema, appId } = await this.formService.getContext(formId);
    const policy = await this.permissionService.getPolicy(user.role);
    const context: PermissionContext = {
      userId: user.sub,
      role: user.role,
      appId,
      formId,
      action,
    };
    const decision = this.permissionEngine.authorize(context, policy);
    return { schema, appId, policy, context, decision };
  }

  /**
   * 填报（R-005/R-008/R-013）：服务端权威计算 + 校验 + 行级权限后落库。
   * 返回记录中 f_amount 等公式字段是服务端结果，非客户端输入。
   */
  async create(
    formId: string,
    values: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<RuntimeRecord> {
    const ctx = await this.authorize(user, formId, 'create');

    // ① 服务端权威计算（覆盖客户端公式值与默认值）
    const computed = this.formulaEngine.computeValues(ctx.schema.fields, values ?? {});

    // ② 显示条件：隐藏字段从待落库数据中剔除
    const visibility = this.formulaEngine.computeVisibility(ctx.schema.fields, computed);
    const visible = this.formulaEngine.applyVisibility(computed, visibility);

    // ③ 服务端校验（不信任客户端校验结果）
    const validation = this.schemaEngine.validateRecord(ctx.schema.fields, visible);
    if (!validation.valid) {
      throw new BusinessException(
        ERROR_CODES.VALIDATION_FAILED,
        validation.errors.join('; '),
      );
    }

    // ④ 行级写校验：记录值必须落在角色的数据范围内
    this.permissionEngine.assertRowAllowed(ctx.context, ctx.policy, visible);

    // ⑤ 只保留 Schema 声明的字段，键由字段 id 映射为 binding.column
    const columns = this.toColumnValues(ctx.schema.fields, visible);
    return this.dataEngine.insert(formId, columns);
  }

  /**
   * 列表查询（R-011/R-013）：筛选/排序/分页 + 行级谓词注入。
   * 当行级规则无法转为 SQL（如含 ||）时，用共享求值器做内存兜底过滤。
   */
  async list(
    formId: string,
    query: DataQuery,
    user: AuthenticatedUser,
  ): Promise<{ rows: RuntimeRecord[]; total: number }> {
    const ctx = await this.authorize(user, formId, 'read');
    const result = await this.dataEngine.query(
      formId,
      query,
      ctx.decision.predicates,
    );

    const rule = ctx.policy.rowRules?.[formId];
    if (rule?.expr?.trim() && ctx.decision.predicates.length === 0) {
      // 规则未转 SQL：内存兜底。附 __record_id 以便映射回记录。
      const candidates = result.rows.map((row) => ({
        __record_id: row.id,
        ...row.values,
      }));
      const kept = this.permissionEngine.filterRows(candidates, rule);
      const keptIds = new Set(kept.map((item) => String(item.__record_id)));
      const rows = result.rows.filter((row) => keptIds.has(row.id));
      return { rows, total: rows.length };
    }
    return result;
  }

  /** 单条详情：需 read 权限，且记录必须落在行级数据范围内 */
  async findOne(
    formId: string,
    recordId: string,
    user: AuthenticatedUser,
  ): Promise<RuntimeRecord> {
    const ctx = await this.authorize(user, formId, 'read');
    const record = await this.dataEngine.findById(formId, recordId);
    if (!record) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, `记录不存在: ${recordId}`);
    }
    this.permissionEngine.assertRowAllowed(ctx.context, ctx.policy, record.values);
    return record;
  }

  /** 更新：校验旧值行级范围（防止把记录改出数据范围），再走权威计算与校验 */
  async update(
    formId: string,
    recordId: string,
    values: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<RuntimeRecord> {
    const ctx = await this.authorize(user, formId, 'update');
    const existing = await this.dataEngine.findById(formId, recordId);
    if (!existing) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, `记录不存在: ${recordId}`);
    }
    this.permissionEngine.assertRowAllowed(ctx.context, ctx.policy, existing.values);

    // 合并旧值后重算公式，避免只传部分字段导致公式依赖缺失
    const merged = { ...existing.values, ...(values ?? {}) };
    const computed = this.formulaEngine.computeValues(ctx.schema.fields, merged);
    const visibility = this.formulaEngine.computeVisibility(ctx.schema.fields, computed);
    const visible = this.formulaEngine.applyVisibility(computed, visibility);
    const validation = this.schemaEngine.validateRecord(ctx.schema.fields, visible);
    if (!validation.valid) {
      throw new BusinessException(
        ERROR_CODES.VALIDATION_FAILED,
        validation.errors.join('; '),
      );
    }

    const columns = this.toColumnValues(ctx.schema.fields, visible);
    const updated = await this.dataEngine.update(formId, recordId, columns);
    if (!updated) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, `记录不存在: ${recordId}`);
    }
    return updated;
  }

  /** 删除：需 delete 权限 + 旧值行级范围校验 */
  async remove(
    formId: string,
    recordId: string,
    user: AuthenticatedUser,
  ): Promise<{ recordId: string; deleted: boolean }> {
    const ctx = await this.authorize(user, formId, 'delete');
    const existing = await this.dataEngine.findById(formId, recordId);
    if (!existing) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, `记录不存在: ${recordId}`);
    }
    this.permissionEngine.assertRowAllowed(ctx.context, ctx.policy, existing.values);
    const deleted = await this.dataEngine.delete(formId, recordId);
    return { recordId, deleted };
  }

  /** 字段 id → binding.column 映射，且只保留 Schema 声明字段，杜绝写入未知列 */
  private toColumnValues(
    fields: FieldSchema[],
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const value = values[field.id];
      if (value === undefined) continue;
      result[field.binding.column] = value;
    }
    return result;
  }
}
