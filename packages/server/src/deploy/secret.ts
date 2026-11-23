/**
 * JWT 密钥安全读取（🔒 v1.3 安全加固）。
 *
 * - 生产环境（NODE_ENV=production）未设置 JWT_SECRET 或仍为弱占位值时，
 *   直接抛错终止启动 —— 避免带着弱密钥上线。
 * - 本地开发允许使用开发默认值，但打印一次性警告。
 */
const DEV_SECRETS = new Set([
  'change-me-in-production',
  'hengyida-private-dev-secret-change-me',
  'hengyida-saas-dev-secret-change-me',
]);

/** 读取 JWT 密钥：开发可降级，生产强制要求强密钥 */
export function resolveJwtSecret(mode: 'saas' | 'private'): string {
  const raw = process.env.JWT_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (!raw || DEV_SECRETS.has(raw) || raw.length < 32) {
    if (isProduction) {
      throw new Error(
        `[${mode}] 生产环境必须设置强 JWT_SECRET（≥32 字符随机值）。` +
          '请生成：node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
      );
    }
    // 本地开发：使用模式专属开发默认值（保持开箱可用）
    return `hengyida-${mode}-dev-secret-change-me`;
  }
  return raw;
}
