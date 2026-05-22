import { ProposalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// ---------------------------------------------------------------------------
// CRIAR proposta (gera via IA)
// ---------------------------------------------------------------------------
export class CreateProposalDto {
  @IsString()
  @MinLength(1)
  leadId!: string;

  @IsString()
  @MinLength(1)
  templateId!: string;

  /** Briefing extra opcional pra IA (ex: "foco em resultado rápido") */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  briefing?: string;
}

// ---------------------------------------------------------------------------
// ATUALIZAR proposta (edição manual)
// ---------------------------------------------------------------------------
export class UpdateProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /**
   * Conteúdo (seções) da proposta — array de objetos JSON.
   * Não usar @IsArray() aqui porque o class-transformer com transform:true
   * corrompe os objetos internos (converte em arrays vazios).
   * Validação real é feita pelo Prisma ao salvar como Json.
   */
  @IsOptional()
  @Allow()
  content?: unknown;

  /**
   * Planos da proposta — array de objetos JSON.
   * Mesmo tratamento que content: @Allow() pra não corromper.
   */
  @IsOptional()
  @Allow()
  plans?: unknown;

  @IsOptional()
  @Allow()
  paymentConditions?: unknown;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  /**
   * Metadados livres da proposta (tema visual, briefing, etc).
   */
  @IsOptional()
  @Allow()
  metadata?: unknown;
}

// ---------------------------------------------------------------------------
// REFINAR proposta (chat com IA)
// ---------------------------------------------------------------------------
export class RefineProposalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  instruction!: string;
}

// ---------------------------------------------------------------------------
// LISTAR propostas
// ---------------------------------------------------------------------------
export class ListProposalsDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

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
// MUDAR status manualmente
// ---------------------------------------------------------------------------
export class UpdateStatusDto {
  @IsEnum(ProposalStatus)
  status!: ProposalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// TRACKING (rota pública /p/:slug/view)
// ---------------------------------------------------------------------------
export class TrackViewDto {
  @IsString()
  @MinLength(8)
  sessionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readingTimeSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  scrollDepthPct?: number;
}
