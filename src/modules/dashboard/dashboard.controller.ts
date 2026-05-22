import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('kpis')
  kpis(@CurrentTeam() teamId: string) {
    return this.service.getKpis(teamId);
  }

  @Get('distribution/niche')
  niche(@CurrentTeam() teamId: string) {
    return this.service.getNicheDistribution(teamId);
  }

  @Get('distribution/quality')
  quality(@CurrentTeam() teamId: string) {
    return this.service.getQualityDistribution(teamId);
  }

  @Get('geo')
  geo(@CurrentTeam() teamId: string) {
    return this.service.getGeoHeatmap(teamId);
  }
}
