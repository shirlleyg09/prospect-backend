import { ContractCategory, ContractStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsDateString,
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

export class CreateContractDto {
  @IsString() @MinLength(2) @MaxLength(200)
  title!: string;

  @IsOptional() @IsEnum(ContractCategory)
  category?: ContractCategory;

  @IsOptional() @IsString()
  templateId?: string;

  @IsOptional() @IsString()
  proposalId?: string;

  @IsOptional() @IsString()
  leadId?: string;

  @IsOptional() @IsString()
  content?: string;

  // Cliente
  @IsOptional() @IsString() @MaxLength(200)
  clientName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  clientDocument?: string;

  @IsOptional() @IsString() @MaxLength(200)
  clientEmail?: string;

  @IsOptional() @IsString() @MaxLength(30)
  clientPhone?: string;

  @IsOptional() @IsString() @MaxLength(500)
  clientAddress?: string;

  // Empresa
  @IsOptional() @IsString() @MaxLength(200)
  companyName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  companyCnpj?: string;

  @IsOptional() @IsString() @MaxLength(200)
  companyEmail?: string;

  @IsOptional() @IsString() @MaxLength(30)
  companyPhone?: string;

  @IsOptional() @IsString() @MaxLength(500)
  companyWebsite?: string;

  @IsOptional() @IsString() @MaxLength(500)
  companyAddress?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  companyLogoUrl?: string;

  // Comerciais
  @IsOptional() @IsNumber()
  totalValue?: number;

  @IsOptional() @IsString() @MaxLength(500)
  paymentTerms?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  contractedItems?: string;

  // Datas
  @IsOptional() @IsDateString()
  startDate?: string;

  @IsOptional() @IsDateString()
  endDate?: string;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsOptional() @Allow()
  variables?: Record<string, string>;

  @IsOptional() @IsBoolean()
  showWatermark?: boolean;

  @IsOptional() @IsString() @MaxLength(20)
  themeColor?: string;

  @IsOptional() @IsString() @MaxLength(50)
  fontFamily?: string;
}

export class UpdateContractDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(ContractCategory) category?: ContractCategory;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() @MaxLength(200) clientName?: string;
  @IsOptional() @IsString() @MaxLength(20) clientDocument?: string;
  @IsOptional() @IsString() @MaxLength(200) clientEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) clientPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) clientAddress?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(20) companyCnpj?: string;
  @IsOptional() @IsString() @MaxLength(200) companyEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) companyPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) companyWebsite?: string;
  @IsOptional() @IsString() @MaxLength(500) companyAddress?: string;
  @IsOptional() @IsString() @MaxLength(1000) companyLogoUrl?: string;
  @IsOptional() @IsNumber() totalValue?: number;
  @IsOptional() @IsString() @MaxLength(500) paymentTerms?: string;
  @IsOptional() @IsString() @MaxLength(2000) contractedItems?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @Allow() variables?: Record<string, string>;
  @IsOptional() @IsBoolean() showWatermark?: boolean;
  @IsOptional() @IsString() @MaxLength(20) themeColor?: string;
  @IsOptional() @IsString() @MaxLength(50) fontFamily?: string;
}

export class UpdateContractStatusDto {
  @IsEnum(ContractStatus)
  status!: ContractStatus;
}

export class ListContractsQueryDto {
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
  @IsOptional() @IsEnum(ContractCategory) category?: ContractCategory;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage?: number = 25;
}

export class CreateContractTemplateDto {
  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsEnum(ContractCategory)
  category?: ContractCategory;

  @IsString() @MinLength(20)
  content!: string;
}

export class GenerateContractAIDto {
  @IsString() @MinLength(5) @MaxLength(500)
  description!: string;

  @IsOptional() @IsEnum(ContractCategory)
  category?: ContractCategory;

  @IsOptional() @IsString() @MaxLength(200)
  clientName?: string;

  @IsOptional() @IsNumber()
  totalValue?: number;
}
