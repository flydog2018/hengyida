/**
 * 启动早期加载 .env（必须在 deploy/ 配置模块求值之前执行）。
 *
 * 背景：config.private.ts / config.saas.ts 在模块顶层读取 process.env 生成常量配置，
 * 而 NestJS 的 ConfigModule.forRoot() 要等 AppModule 初始化才加载 .env，
 * 导致宿主机直连调试时读到 root/空密码默认值。
 * 容器部署时环境变量由 compose 注入，dotenv 不会覆盖已有 process.env，行为不变。
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
];

for (const file of candidates) {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file });
    break;
  }
}
