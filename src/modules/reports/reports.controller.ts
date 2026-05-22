import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { ReportPeriod, ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('summary')
  getSummary(
    @CurrentTeam() teamId: string,
    @Query('period') period: ReportPeriod = '30d',
  ) {
    return this.service.getSummary(teamId, period);
  }

  @Get('funnel')
  getFunnel(
    @CurrentTeam() teamId: string,
    @Query('period') period: ReportPeriod = '30d',
  ) {
    return this.service.getConversionFunnel(teamId, period);
  }

  @Get('proposals-breakdown')
  getBreakdown(
    @CurrentTeam() teamId: string,
    @Query('period') period: ReportPeriod = '30d',
  ) {
    return this.service.getProposalsBreakdown(teamId, period);
  }

  @Get('decision-time')
  getDecisionTime(
    @CurrentTeam() teamId: string,
    @Query('period') period: ReportPeriod = '30d',
  ) {
    return this.service.getAverageDecisionTime(teamId, period);
  }

  @Get('top-leads')
  getTopLeads(@CurrentTeam() teamId: string) {
    return this.service.getTopLeads(teamId, 10);
  }

  @Get('monthly-revenue')
  getMonthlyRevenue(@CurrentTeam() teamId: string) {
    return this.service.getRevenueByMonth(teamId);
  }
}
