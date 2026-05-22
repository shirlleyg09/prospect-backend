// backend/src/modules/admin/controllers/admin-dashboard.controller.ts
import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminDashboardService } from '../services/admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('stats')
  stats() {
    return this.dashboard.getStats();
  }

  @Get('activity')
  activity(@Query('limit') limit?: string) {
    return this.dashboard.getRecentActivity(limit ? Number(limit) : 20);
  }

  @Get('alerts')
  alerts(@Query('resolved') resolved?: string) {
    return this.dashboard.getAlerts(resolved === 'true');
  }

  @Patch('alerts/:id/read')
  markRead(@Param('id') id: string) {
    return this.dashboard.markAlertRead(id);
  }

  @Get('alerts/generate')
  generateAlerts() {
    return this.dashboard.generateAlerts();
  }
}
