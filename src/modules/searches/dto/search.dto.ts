import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSearchDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() niche!: string;
  @IsString() @IsNotEmpty() location!: string;

  @IsOptional() @IsObject() filters?: Record<string, unknown>;

  @IsOptional() @IsArray() @IsString({ each: true }) providers?: string[];

  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
}
