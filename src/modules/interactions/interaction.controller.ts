import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { CreateInteractionDto, InteractionService } from './interaction.service';

@Controller('leads/:leadId/interactions')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class InteractionController {
  constructor(private readonly service: InteractionService) {}

  @Get()
  list(@CurrentTeam() teamId: string, @Param('leadId') leadId: string) {
    return this.service.listByLead(teamId, leadId);
  }

  @Post()
  create(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('leadId') leadId: string,
    @Body() dto: CreateInteractionDto,
  ) {
    return this.service.create(teamId, userId, leadId, dto);
  }
}
