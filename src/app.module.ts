import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configValidationSchema } from './config/config.validation';
import { DatabaseModule } from './database/database.module';
import { AIModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AutomationModule } from './modules/automation/automation.module';
import { CrmModule } from './modules/crm/crm.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExportModule } from './modules/export/export.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MessagesModule } from './modules/messages/messages.module';
import { FinanceModule } from './modules/finance/finance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { SearchesModule } from './modules/searches/searches.module';
import { PgQueueModule } from './queue/pg-queue.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 100 }, // 100 req/min por IP por default
    ]),

    DatabaseModule,
    PgQueueModule,

    AuthModule,
    ProvidersModule,
    AIModule,
    LeadsModule,
    SearchesModule,
    InteractionsModule,
    MessagesModule,
    FinanceModule,
    NotificationsModule,
    ReportsModule,
    ContractsModule,
    CrmModule,
    DashboardModule,
    AdminModule,
    ExportModule,
    AutomationModule,
    ProposalsModule,
    QueueModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
