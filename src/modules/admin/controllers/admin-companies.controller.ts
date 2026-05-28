import { Controller, Get, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminCompaniesService } from '../services/admin-companies.service';

@Controller('admin/companies')
@UseGuards(AdminGuard)
export class AdminCompaniesController {
  constructor(private readonly svc: AdminCompaniesService) {}

  @Get()
  list(
    @Query('page') page = '1',
    @Query('perPage') perPage = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('planCode') planCode?: string,
  ) {
    return this.svc.list({ page: +page, perPage: +perPage, search, status, planCode });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string; reason?: string }) {
    return this.svc.updateStatus(id, body.status, body.reason);
  }

  @Patch(':id/plan')
  changePlan(@Param('id') id: string, @Body() body: { planId: string; notes?: string }) {
    return this.svc.changePlan(id, body.planId, body.notes);
  }

  @Patch(':id/limits')
  updateLimits(@Param('id') id: string, @Body() body: Record<string, number>) {
    return this.svc.updateLimits(id, body);
  }
}
