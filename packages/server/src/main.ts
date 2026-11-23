/**
 * NestJS 启动入口：
 * - 加载部署配置（DEPLOY_MODE）、挂载 /api 前缀；
 * - 全局注册统一响应拦截器、异常过滤器、DTO 校验管道；
 * - 接入 pino 结构化 JSON 日志与 pino-http 请求日志；
 * - 提供根路径 GET /healthz（DB ping + 版本信息），不受 /api 前缀与响应包装影响；
 * - 启用 Swagger（/api-docs），全功能 API 自动生成 OpenAPI 3.0 文档。
 */
// 必须最先执行：在 deploy 配置模块求值前把 .env 注入 process.env
import './load-env';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Knex } from 'knex';
import pinoHttp from 'pino-http';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/AllExceptionsFilter';
import { JsonLoggerService, readVersion } from './common/JsonLoggerService';
import { ResponseInterceptor } from './common/ResponseInterceptor';
import { KNEX_CONNECTION } from './core/data-engine';
import { getDeployConfig } from './deploy';

async function bootstrap(): Promise<void> {
  const startedAt = Date.now();
  const deployConfig = getDeployConfig();
  const logger = new JsonLoggerService();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(logger);

  // 请求日志与业务日志共用 pino 实例，容器输出统一为 JSON。
  app.use(
    pinoHttp({
      logger: logger.raw(),
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // 根路径健康检查：绕过 /api 前缀与 ResponseInterceptor，便于 Docker/K8s/前端状态页直接使用。
  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.get('/healthz', async (_req: unknown, res: any) => {
    const pingStarted = Date.now();
    try {
      const knex = app.get<Knex>(KNEX_CONNECTION);
      await knex.raw('SELECT 1 AS ok');
      res.status(200).json({
        status: 'ok',
        db: 'up',
        dbPingMs: Date.now() - pingStarted,
        version: readVersion(),
        deployMode: process.env.DEPLOY_MODE || deployConfig.mode,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, context: 'Healthz' }, 'healthz database ping failed');
      res.status(503).json({
        status: 'error',
        db: 'down',
        version: readVersion(),
        deployMode: process.env.DEPLOY_MODE || deployConfig.mode,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'database ping failed',
      });
    }
  });

  // 全局 API 前缀：最终路径如 /api/v1/apps
  app.setGlobalPrefix(deployConfig.server.apiPrefix);

  // 统一响应与异常出口（顺序无关：拦截器处理成功，过滤器处理失败）
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // 一期不对动态字段做白名单裁剪，避免误伤 Schema/values 等自由结构
      whitelist: false,
      forbidNonWhitelisted: false,
    }),
  );
  app.enableCors({ origin: true, credentials: true });

  // Swagger：Bearer JWT 认证入口，供 designer/runtime 与第三方对接
  const swaggerConfig = new DocumentBuilder()
    .setTitle('恒易搭 API')
    .setDescription('恒易搭零代码平台服务端 API（REST + OpenAPI 3.0）')
    .setVersion('1.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(deployConfig.server.port);
  logger.log(
    `恒易搭服务端启动：port=${deployConfig.server.port} prefix=${deployConfig.server.apiPrefix} version=${readVersion()}`,
    'Bootstrap',
  );
}

void bootstrap();
