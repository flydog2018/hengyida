/**
 * NestJS 结构化 JSON 日志适配器（pino）。
 *
 * 目标：容器日志直接输出 JSON，便于 ELK / Loki 采集；
 * 敏感字段（Authorization / Cookie / 密码 / JWT / DB 口令）统一脱敏。
 */
import { Injectable, type LoggerService, type LogLevel } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'DB_PASSWORD',
  'MYSQL_PASSWORD',
  'MYSQL_ROOT_PASSWORD',
  'JWT_SECRET',
];

export function readVersion(): string {
  try {
    // 源码位于 src/common，编译后位于 dist/common；两者向上两级都是 packages/server。
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 从 Nest 的可变参数中拆出 context（最后一个字符串参数）与 error trace。 */
function splitParams(params: unknown[]): { context?: string; trace?: string } {
  const context = params.length && typeof params[params.length - 1] === 'string'
    ? (params[params.length - 1] as string)
    : undefined;
  const trace = params.find((p) => typeof p === 'string' && p.includes('\n    at ')) as string | undefined;
  return { context, trace };
}

@Injectable()
export class JsonLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      base: { service: 'hengyida-server', version: readVersion() },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT, censor: '[REDACTED]' },
      messageKey: 'msg',
    });
  }

  /** 供 pino-http 复用同一个 pino 实例，保证请求日志与业务日志格式一致。 */
  raw(): Logger {
    return this.logger;
  }

  setLogLevels?(levels: LogLevel[]): void {
    this.logger.level = levels[0] || 'info';
  }

  log(message: unknown, ...params: unknown[]): void {
    const { context } = splitParams(params);
    this.logger.info({ context }, serialize(message));
  }

  error(message: unknown, ...params: unknown[]): void {
    const { context, trace } = splitParams(params);
    this.logger.error({ context, trace }, serialize(message));
  }

  warn(message: unknown, ...params: unknown[]): void {
    const { context } = splitParams(params);
    this.logger.warn({ context }, serialize(message));
  }

  debug(message: unknown, ...params: unknown[]): void {
    const { context } = splitParams(params);
    this.logger.debug({ context }, serialize(message));
  }

  verbose(message: unknown, ...params: unknown[]): void {
    const { context } = splitParams(params);
    this.logger.trace({ context }, serialize(message));
  }

  fatal(message: unknown, ...params: unknown[]): void {
    const { context } = splitParams(params);
    this.logger.fatal({ context }, serialize(message));
  }
}
