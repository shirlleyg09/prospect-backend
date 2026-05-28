import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';

import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminGuard } from './guards/admin.guard';

import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';

import { AdminCompaniesController } from './controllers/admin-companies.controller';
import { AdminCompaniesService } from './services/admin-companies.service';

import { AdminPlansController } from './controllers/admin-plans.controller';
import { AdminPlansService } from './services/admin-plans.service';

import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminUsersService } from './services/admin-users.service';

import { AdminSubscriptionsController } from './controllers/admin-subscriptions.controller';
import { AdminSubscriptionsService } from './services/admin-subscriptions.service';

import { AdminFeatureFlagsController } from './controllers/admin-feature-flags.controller';
import { AdminFeatureFlagsService } from './services/admin-feature-flags.service';

import { AdminTicketsController } from './controllers/admin-tickets.controller';
import { AdminTicketsService } from './services/admin-tickets.service';

import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminAuditService } from './services/admin-audit.service';

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
    AdminCompaniesController,
    AdminPlansController,
    AdminUsersController,
    AdminSubscriptionsController,
    AdminFeatureFlagsController,
    AdminTicketsController,
    AdminAuditController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminGuard,
    AdminCompaniesService,
    AdminPlansService,
    AdminUsersService,
    AdminSubscriptionsService,
    AdminFeatureFlagsService,
    AdminTicketsService,
    AdminAuditService,
  ],
  exports: [AdminGuard, AdminAuthService, AdminAuditService],
})
export class AdminModule {}
