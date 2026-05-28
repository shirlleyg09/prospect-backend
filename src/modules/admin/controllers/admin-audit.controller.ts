import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminAuditService } from '../services/admin-audit.service';

@Controller('admin/audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly svc: AdminAuditService) {}

  @Get()
  list(
    @Query('page') page = '1',
    @Query('perPage') perPage = '25',
    @Query('action') action?: string,
    @Query('adminUserId') adminUserId?: string,
    @Query('targetTeamId') targetTeamId?: string,
  ) {
    return this.svc.list({ page: +page, perPage: +perPage, action, adminUserId, targetTeamId });
  }
}
