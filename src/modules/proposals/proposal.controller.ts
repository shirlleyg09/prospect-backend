/**
 * @file proposal.controller.ts
 * @description
 *   Endpoints HTTP autenticados para o CRUD de propostas.
 *
 *   Escopo: /proposals/*
 *   Protegido por JwtAuthGuard + TeamScopeGuard.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import {
  CreateProposalDto,
  ListProposalsDto,
  RefineProposalDto,
  UpdateProposalDto,
  UpdateStatusDto,
} from './dto/proposal.dto';
import { ProposalService } from './proposal.service';
import { ProposalTemplateService } from './proposal-template.service';

@Controller('proposals')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class ProposalController {
  constructor(
    private readonly proposals: ProposalService,
    private readonly templates: ProposalTemplateService,
  ) {}

  // ------------------------------------------------------------------------
  // Templates (disponíveis pro team)
  // ------------------------------------------------------------------------
  @Get('templates')
  listTemplates(@CurrentTeam() teamId: string) {
    return this.templates.listForTeam(teamId);
  }

  // ------------------------------------------------------------------------
  // Usage / Quota
  // ------------------------------------------------------------------------
  @Get('usage')
  getUsage(@CurrentTeam() teamId: string) {
    return this.proposals.getUsage(teamId);
  }

  // ------------------------------------------------------------------------
  // CRUD de propostas
  // ------------------------------------------------------------------------
  @Get()
  list(@CurrentTeam() teamId: string, @Query() q: ListProposalsDto) {
    return this.proposals.list(teamId, q);
  }

  @Get(':id')
  findOne(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.proposals.findById(teamId, id);
  }

  @Post()
  create(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposals.create(teamId, userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProposalDto,
  ) {
    return this.proposals.update(teamId, userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.proposals.remove(teamId, id);
  }

  // ------------------------------------------------------------------------
  // Ações específicas
  // ------------------------------------------------------------------------
  @Post(':id/refine')
  refine(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RefineProposalDto,
  ) {
    return this.proposals.refine(teamId, userId, id, dto);
  }

  @Post(':id/publish')
  publish(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.proposals.publish(teamId, userId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.proposals.updateStatus(teamId, userId, id, dto.status, dto.rejectionReason);
  }

  /**
   * Lista o histórico (timeline) de eventos da proposta.
   */
  @Get(':id/history')
  history(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
  ) {
    return this.proposals.getHistory(teamId, id);
  }
}
