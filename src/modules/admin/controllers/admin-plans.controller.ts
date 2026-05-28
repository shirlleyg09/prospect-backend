import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminPlansService } from '../services/admin-plans.service';

@Controller('admin/plans')
@UseGuards(AdminGuard)
export class AdminPlansController {
  constructor(private readonly svc: AdminPlansService) {}

  @Get() list() { return this.svc.list(); }
  @Post() create(@Body() dto: any) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: any) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.deactivate(id); }
}
