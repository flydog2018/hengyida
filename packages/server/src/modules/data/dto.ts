/** 数据模块 DTO */
import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class ValuesDto {
  @ApiProperty({
    description: '字段值映射（键为字段 id，如 f_price）',
    example: { f_name: '张三', f_price: 12.5, f_qty: 3 },
  })
  @IsObject()
  values!: Record<string, unknown>;
}
