/** 认证控制器：登录签发 JWT */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto';
import { AuthService } from './auth.service';

@ApiTags('认证')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '登录并签发 JWT（角色由服务端用户记录携带）' })
  async login(@Body() dto: LoginDto): Promise<unknown> {
    return this.authService.login(dto.username, dto.password);
  }
}
