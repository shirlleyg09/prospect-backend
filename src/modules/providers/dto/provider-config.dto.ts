import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum ProviderKindDto {
  SERPAPI = 'SERPAPI',
  GOOGLE_PLACES = 'GOOGLE_PLACES',
  APIFY = 'APIFY',
  CUSTOM = 'CUSTOM',
}

/**
 * Payload de criação/atualização de configuração de provider.
 * Os secrets são strings arbitrárias (keys de API) — não validamos formato
 * porque cada provider tem o seu.
 */
export class UpsertProviderConfigDto {
  @IsEnum(ProviderKindDto)
  kind!: ProviderKindDto;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number = 10;

  @IsObject()
  secrets!: Record<string, string>;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown> = {};
}

/**
 * Payload de "testar sem salvar".
 */
export class TestConnectionDto {
  @IsEnum(ProviderKindDto)
  kind!: ProviderKindDto;

  @IsObject()
  secrets!: Record<string, string>;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown> = {};
}
