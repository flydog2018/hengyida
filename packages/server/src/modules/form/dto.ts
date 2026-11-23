/** 表单模块 DTO */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateFormDto {
  @ApiProperty({ description: '所属应用 id', example: 'app_xxx' })
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @ApiProperty({ description: '表单稳定 id', example: 'form_employee' })
  @IsString()
  @IsNotEmpty()
  formId!: string;

  @ApiProperty({ description: '表单展示名称', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class SaveSchemaDto {
  @ApiProperty({ description: 'FormSchema 配置 JSON（草稿）' })
  @IsObject()
  schema!: Record<string, unknown>;
}

export class ImportFormDto {
  @ApiProperty({ description: '表单 SchemaEnvelope 配置 JSON' })
  @IsObject()
  envelope!: Record<string, unknown>;
}

export class PublishDto {
  @ApiProperty({
    description: '可选：发布时直接携带最新 FormSchema；缺省则发布当前草稿',
    required: false,
  })
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;
}
