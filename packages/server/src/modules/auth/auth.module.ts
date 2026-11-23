/** 认证模块：全局导出 JwtService 与 AuthGuard，供各业务模块复用 */
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getDeployConfig } from '../../deploy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './jwt.strategy';

@Global()
@Module({
  imports: [
    // registerAsync：延迟到 DI 初始化时才读取部署配置，确保 ConfigModule 已把 .env 注入 process.env
    JwtModule.registerAsync({
      useFactory: () => {
        const deployConfig = getDeployConfig();
        return {
          secret: deployConfig.jwt.secret,
          signOptions: { expiresIn: deployConfig.jwt.expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule {}
