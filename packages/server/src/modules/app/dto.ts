/** 应用模块 DTO */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAppDto {
  @ApiProperty({ description: '应用名称', example: '人事管理' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: '应用描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ImportSchemaDto {
  @ApiProperty({ description: 'SchemaEnvelope 配置 JSON' })
  @IsObject()
  envelope!: Record<string, unknown>;
}
