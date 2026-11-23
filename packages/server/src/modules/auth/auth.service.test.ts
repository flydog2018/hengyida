/** 认证服务密码加固单测（🔒 v1.3：bcrypt 摘要 + 旧摘要兼容） */
import { describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

/** 构造仅用于测试的 AuthService（不触发 onModuleInit，传空 mock 依赖） */
function makeService(): AuthService {
  return new AuthService({} as never, {} as never);
}

describe('AuthService 密码摘要（bcrypt）', () => {
  it('hashPassword 产出标准 bcrypt $2a$/2b$ 哈希（非 SHA-256）', async () => {
    const hash = await makeService().hashPassword('admin123');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).toHaveLength(60);
    expect(hash).not.toBe('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
  });

  it('bcrypt.compare 能正确校验 hashPassword 生成的摘要', async () => {
    const service = makeService();
    const hash = await service.hashPassword('S3cureP@ssw0rd');
    expect(await bcrypt.compare('S3cureP@ssw0rd', hash)).toBe(true);
    expect(await bcrypt.compare('wrong-password', hash)).toBe(false);
  });

  it('相同密码两次哈希结果不同（bcrypt 随机盐生效）', async () => {
    const service = makeService();
    const h1 = await service.hashPassword('same-password');
    const h2 = await service.hashPassword('same-password');
    expect(h1).not.toBe(h2);
  });

  it('兼容 v1.1 的 SHA-256 固定盐摘要（旧库平滑升级不锁死）', async () => {
    // 复现 v1.1 的 legacy 摘要：sha256("hengyida:" + password)
    const { createHash } = await import('node:crypto');
    const legacyHash = createHash('sha256')
      .update('hengyida:legacyPass')
      .digest('hex');
    expect(legacyHash).toMatch(/^[0-9a-f]{64}$/);
    // verifyPassword 为私有方法，此处通过类型断言访问以验证兼容逻辑
    const verify = (
      makeService() as unknown as {
        verifyPassword: (p: string, h: string) => Promise<boolean>;
      }
    ).verifyPassword;
    expect(await verify.call(makeService(), 'legacyPass', legacyHash)).toBe(true);
    expect(await verify.call(makeService(), 'wrongPass', legacyHash)).toBe(false);
  });
});
