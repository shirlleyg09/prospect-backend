// backend/src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';

// Auth
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminGuard } from './guards/admin.guard';

// Dashboard
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminGuard,
  ],
  exports: [AdminGuard, AdminAuthService],
})
export class AdminModule {}
