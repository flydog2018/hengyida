/**
 * 根模块：聚合业务模块 + 全局 Knex 连接 Provider。
 * ConfigModule 加载 .env 到 process.env，DeployMode 从中读取部署差异；
 * 业务模块零部署分支，数据库方言由 DataEngine 内的 Dialect 抽象隔离。
 */
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import knex, { type Knex } from 'knex';
import { KNEX_CONNECTION } from './core/data-engine';
import { getDeployConfig } from './deploy';
import { ApplicationModule } from './modules/app/app.module';
import { AuthModule } from './modules/auth/auth.module';
import { DataModule } from './modules/data/data.module';
import { FormModule } from './modules/form/form.module';
import { PermissionModule } from './modules/permission/permission.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ApplicationModule,
    FormModule,
    PermissionModule,
    DataModule,
  ],
  providers: [
    {
      provide: KNEX_CONNECTION,
      useFactory: (): Knex => {
        const { database } = getDeployConfig();
        return knex({
          client: 'mysql2',
          connection: {
            host: database.host,
            port: database.port,
            user: database.user,
            password: database.password,
            database: database.database,
          },
          pool: { min: 0, max: 10 },
        });
      },
    },
  ],
  exports: [KNEX_CONNECTION],
})
export class AppModule {}
