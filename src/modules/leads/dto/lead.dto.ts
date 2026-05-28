import { LeadTemperature } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListLeadsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() searchId?: string;
  @IsOptional() @IsString() niche?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;

  @IsOptional() @IsEnum(LeadTemperature) temperature?: LeadTemperature;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) minScore?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) maxScore?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() pipelineStageId?: string;
  @IsOptional() @IsString() assignedToId?: string;

  @IsOptional() @IsDateString() createdAfter?: string;
  @IsOptional() @IsDateString() createdBefore?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) perPage?: number = 25;

  @IsOptional() @IsString() sortBy?: 'leadScore' | 'createdAt' | 'estimatedTicket' = 'leadScore';
  @IsOptional() @IsString() sortDir?: 'asc' | 'desc' = 'desc';
}

export class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() pipelineStageId?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class BulkAssignDto {
  @IsArray() @IsString({ each: true }) leadIds!: string[];
  @IsString() assignedToId!: string;
}

// ---------------------------------------------------------------------------
// CRIAÇÃO MANUAL DE LEAD
// ---------------------------------------------------------------------------
export class CreateManualLeadDto {
  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(200)
  legalName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cnpj?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  email?: string;

  @IsOptional() @IsString() @MaxLength(500)
  website?: string;

  @IsOptional() @IsString() @MaxLength(200)
  instagram?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsString() @MaxLength(50)
  state?: string;

  @IsOptional() @IsString() @MaxLength(100)
  niche?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  googleRating?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  googleReviews?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

// ---------------------------------------------------------------------------
// IMPORT CSV/EXCEL — recebe dados já parseados pelo frontend
// ---------------------------------------------------------------------------
export class ImportLeadsDto {
  @IsArray()
  @Allow()
  leads!: Array<{
    name: string;
    phone?: string;
    email?: string;
    website?: string;
    instagram?: string;
    address?: string;
    city?: string;
    state?: string;
    niche?: string;
    cnpj?: string;
    notes?: string;
    [key: string]: unknown;
  }>;
}
