import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, CurrentAdmin } from '../guards/admin.guard';
import { AdminSubscriptionsService } from '../services/admin-subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(AdminGuard)
export class AdminSubscriptionsController {
  constructor(private readonly svc: AdminSubscriptionsService) {}

  @Get()
  list(
    @Query('page') page = '1',
    @Query('perPage') perPage = '25',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.list({ page: +page, perPage: +perPage, status, search });
  }

  @Post()
  create(
    @Body() dto: any,
    @CurrentAdmin('id') adminId: string,
  ) {
    return this.svc.create(dto, adminId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentAdmin('id') adminId: string,
  ) {
    return this.svc.update(id, dto, adminId);
  }
}
