import { InteractionChannel, MessageTemplateCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// ---------------------------------------------------------------------------
// LIST templates
// ---------------------------------------------------------------------------
export class ListMessageTemplatesDto {
  @IsOptional()
  @IsEnum(InteractionChannel)
  channel?: InteractionChannel;

  @IsOptional()
  @IsEnum(MessageTemplateCategory)
  category?: MessageTemplateCategory;
}

// ---------------------------------------------------------------------------
// LIST mensagens geradas
// ---------------------------------------------------------------------------
export class ListMessagesDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsEnum(InteractionChannel)
  channel?: InteractionChannel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 25;
}

// ---------------------------------------------------------------------------
// GERAR a partir de template
// ---------------------------------------------------------------------------
export class GenerateFromTemplateDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @IsString()
  @MinLength(1)
  templateId!: string;

  /** Briefing opcional — contexto extra pra IA (ex: objeção específica) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  briefing?: string;
}

// ---------------------------------------------------------------------------
// GERAR livre (prompt do usuário)
// ---------------------------------------------------------------------------
export class GenerateFreeMessageDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @IsEnum(InteractionChannel)
  channel!: InteractionChannel;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  instruction!: string;
}

// ---------------------------------------------------------------------------
// REFINAR
// ---------------------------------------------------------------------------
export class RefineMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  instruction!: string;
}
