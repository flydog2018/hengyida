/**
 * 部署模式切换（架构文档 7.12）：业务代码零部署分支。
 * SaaS 与私有化功能一致，差异全部收敛到 DEPLOY_MODE 环境变量 + 本层配置。
 */
import { saasConfig } from './config.saas';
import { privateConfig } from './config.private';

/** 一期支持的两种部署形态 */
export type DeployModeType = 'saas' | 'private';

/** 部署配置契约：与业务代码解耦，仅由本层提供 */
export interface DeployConfig {
  mode: DeployModeType;
  server: {
    port: number;
    /** 全局 API 前缀，如 api（完整路径 /api/v1/...） */
    apiPrefix: string;
  };
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  /** 一期两模式功能一致；增强项开关在此集中声明，业务层不判断模式 */
  features: {
    excelImportExport: boolean;
    advancedRowPermission: boolean;
  };
}

/** 环境变量名 */
export const DEPLOY_MODE_ENV = 'DEPLOY_MODE';

/** 读取当前部署模式；非法值一律回退到 private（私有化优先，最安全） */
export function getDeployMode(): DeployModeType {
  const raw = (process.env[DEPLOY_MODE_ENV] ?? '').trim().toLowerCase();
  return raw === 'saas' ? 'saas' : 'private';
}

/** 获取当前部署配置 */
export function getDeployConfig(): DeployConfig {
  return getDeployMode() === 'saas' ? saasConfig : privateConfig;
}

/** 供少数基础设施代码显式判断（禁止在 modules/core 业务代码中使用） */
export function isDeployMode(mode: DeployModeType): boolean {
  return getDeployMode() === mode;
}
