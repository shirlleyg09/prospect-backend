import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminFeatureFlagsService } from '../services/admin-feature-flags.service';

@Controller('admin/feature-flags')
@UseGuards(AdminGuard)
export class AdminFeatureFlagsController {
  constructor(private readonly svc: AdminFeatureFlagsService) {}

  @Get()
  listAll(@Query('teamId') teamId?: string) {
    return this.svc.listAll(teamId);
  }

  @Post(':teamId/:feature')
  toggle(
    @Param('teamId') teamId: string,
    @Param('feature') feature: string,
    @Body() body: { enabled: boolean; notes?: string },
  ) {
    return this.svc.toggle(teamId, feature, body.enabled, body.notes);
  }

  @Patch('bulk')
  bulkUpdate(@Body() body: { teamId: string; flags: Record<string, boolean> }) {
    return this.svc.bulkUpdate(body.teamId, body.flags);
  }
}
