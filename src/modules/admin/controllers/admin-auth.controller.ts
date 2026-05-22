// backend/src/modules/admin/controllers/admin-auth.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminGuard, CurrentAdmin } from '../guards/admin.guard';

class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: any) {
    return admin;
  }

  @Post('change-password')
  @UseGuards(AdminGuard)
  changePassword(
    @CurrentAdmin('id') adminId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(adminId, dto.currentPassword, dto.newPassword);
  }
}
