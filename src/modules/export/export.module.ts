import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { DatabaseModule } from '../../database/database.module';
import { ExportService, ExportFormat } from './export.service';

@Controller('exports')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class ExportController {
  constructor(private readonly service: ExportService) {}

  @Get()
  async download(
    @CurrentTeam() teamId: string,
    @Query('format') format: ExportFormat,
    @Query('temperature') temperature: string | undefined,
    @Query('niche') niche: string | undefined,
    @Query('minScore') minScore: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.service.generateSync(teamId, format, {
      temperature,
      niche,
      minScore: minScore ? Number(minScore) : undefined,
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
