/**
 * 私有化部署配置：与 SaaS 同一套代码，仅连接信息与库名不同。
 * 环境变量均来自 deployments/private/.env.private.example（Phase 1 提供基础 Compose）。
 */
import type { DeployConfig } from './DeployMode';
import { resolveJwtSecret } from './secret';

/** 安全读取正整数环境变量 */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const privateConfig: DeployConfig = {
  mode: 'private',
  server: {
    port: toPositiveInt(process.env.PORT, 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
  },
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: toPositiveInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'hengyida_private',
  },
  jwt: {
    secret: resolveJwtSecret('private'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },
  features: {
    // 一期两模式功能一致；布尔值集中在此，供后续开关读取，业务层零 if(mode) 分支
    excelImportExport: false,
    advancedRowPermission: false,
  },
};
