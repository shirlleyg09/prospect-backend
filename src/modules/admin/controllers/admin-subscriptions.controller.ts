import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(id, dto);
  }
}
