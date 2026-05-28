import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, CurrentAdmin } from '../guards/admin.guard';
import { AdminTicketsService } from '../services/admin-tickets.service';

@Controller('admin/tickets')
@UseGuards(AdminGuard)
export class AdminTicketsController {
  constructor(private readonly svc: AdminTicketsService) {}

  @Get()
  list(
    @Query('page') page = '1',
    @Query('perPage') perPage = '25',
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.svc.list({ page: +page, perPage: +perPage, status, priority });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { status?: string; assignedTo?: string; priority?: string },
  ) {
    return this.svc.update(id, dto);
  }

  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @Body() body: { message: string },
    @CurrentAdmin('id') adminId: string,
  ) {
    return this.svc.reply(id, body.message, adminId);
  }
}
