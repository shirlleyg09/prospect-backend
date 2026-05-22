import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { CrmService } from './crm.service';

class MoveLeadDto {
  @IsString() targetStageId!: string;
  @IsInt() @Min(0) targetIndex!: number;
}

@Controller('crm')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('board')
  board(@CurrentTeam() teamId: string) {
    return this.crm.getBoard(teamId);
  }

  @Patch('leads/:id/move')
  async move(
    @CurrentTeam() teamId: string,
    @Param('id') leadId: string,
    @Body() dto: MoveLeadDto,
  ) {
    await this.crm.moveLead(teamId, leadId, dto.targetStageId, dto.targetIndex);
    return { ok: true };
  }
}
