/** JWT 密钥安全读取单测（🔒 v1.3 安全加固） */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveJwtSecret } from './secret';

describe('resolveJwtSecret', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('开发环境未提供密钥时返回开发默认值（开箱可用）', () => {
    expect(resolveJwtSecret('private')).toContain('dev-secret');
  });

  it('接受 ≥32 字符的强随机密钥', () => {
    const strong = 'a'.repeat(64);
    process.env.JWT_SECRET = strong;
    expect(resolveJwtSecret('private')).toBe(strong);
  });

  it('生产环境未设置密钥时拒绝启动', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveJwtSecret('private')).toThrow(/生产环境必须设置强 JWT_SECRET/);
  });

  it('生产环境使用弱占位值时拒绝启动', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'change-me-in-production';
    expect(() => resolveJwtSecret('saas')).toThrow(/生产环境必须设置强 JWT_SECRET/);
  });

  it('生产环境使用短密钥（<32）时拒绝启动', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short-secret';
    expect(() => resolveJwtSecret('private')).toThrow(/生产环境必须设置强 JWT_SECRET/);
  });

  it('生产环境使用强密钥时正常返回', () => {
    process.env.NODE_ENV = 'production';
    const strong = 'b'.repeat(48);
    process.env.JWT_SECRET = strong;
    expect(resolveJwtSecret('private')).toBe(strong);
  });
});
