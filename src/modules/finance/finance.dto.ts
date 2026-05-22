import { PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
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

// ---------------------------------------------------------------------------
// REVENUE
// ---------------------------------------------------------------------------

export class CreateRevenueDto {
  @IsString() @MinLength(2) @MaxLength(300)
  description!: string;

  @IsNumber() @Min(0)
  amount!: number;

  @IsOptional() @IsString()
  proposalId?: string;

  @IsOptional() @IsString()
  leadId?: string;

  @IsOptional() @IsString()
  planTier?: string;

  @IsOptional() @IsDateString()
  closedAt?: string;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  /** Número de parcelas pra gerar em AccountsReceivable (default 1 = à vista) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24)
  installments?: number;
}

export class UpdateRevenueDto {
  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsDateString()
  paidAt?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

// ---------------------------------------------------------------------------
// ACCOUNTS RECEIVABLE
// ---------------------------------------------------------------------------

export class UpdateReceivableDto {
  @IsOptional() @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional() @IsDateString()
  paidAt?: string;

  @IsOptional() @IsString() @MaxLength(100)
  paymentMethod?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

// ---------------------------------------------------------------------------
// ACCOUNTS PAYABLE
// ---------------------------------------------------------------------------

export class CreatePayableDto {
  @IsString() @MinLength(2) @MaxLength(300)
  description!: string;

  @IsNumber() @Min(0)
  amount!: number;

  @IsOptional() @IsString() @MaxLength(100)
  category?: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional() @IsString() @MaxLength(100)
  paymentMethod?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class UpdatePayableDto {
  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsString() @MaxLength(100)
  category?: string;

  @IsOptional() @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsDateString()
  paidAt?: string;

  @IsOptional() @IsString() @MaxLength(100)
  paymentMethod?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

// ---------------------------------------------------------------------------
// LIST / FILTER
// ---------------------------------------------------------------------------

export class ListFinanceQueryDto {
  @IsOptional() @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  perPage?: number = 25;
}
