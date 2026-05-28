import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { AIService } from '../ai/services/ai.service';
import {
  BulkAssignDto,
  CreateManualLeadDto,
  ImportLeadsDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { LeadService } from './lead.service';

@Controller('leads')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class LeadController {
  constructor(
    private readonly leadService: LeadService,
    private readonly aiService: AIService,
  ) {}

  @Get()
  list(@CurrentTeam() teamId: string, @Query() q: ListLeadsQueryDto) {
    return this.leadService.list(teamId, q);
  }

  @Get('debug/score-stats')
  async debugScoreStats(@CurrentTeam() teamId: string) {
    return this.leadService.getScoreDebugStats(teamId);
  }

  @Get(':id')
  findOne(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.leadService.findById(teamId, id);
  }

  @Patch(':id')
  update(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(teamId, userId, id, dto);
  }

  /**
   * Criação manual de lead via formulário do app.
   */
  @Post('manual')
  createManual(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateManualLeadDto,
  ) {
    return this.leadService.createManual(teamId, userId, dto);
  }

  /**
   * Importação de leads a partir de planilha (CSV/Excel).
   * O frontend parseia o arquivo e envia os dados já normalizados.
   */
  @Post('import')
  importLeads(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ImportLeadsDto,
  ) {
    return this.leadService.importBatch(teamId, userId, dto.leads);
  }

  @Post('bulk-assign')
  async bulkAssign(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: BulkAssignDto,
  ) {
    const updated = await this.leadService.bulkAssign(teamId, userId, dto.leadIds, dto.assignedToId);
    return { updated };
  }

  @Post(':id/analyze')
  async reanalyze(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.leadService.enqueueAnalysis(teamId, [id], userId);
  }

  @Post('analyze-pending')
  async analyzePending(
    @CurrentTeam() teamId: string,
    @Body() body: {
      searchId?: string;
      niche?: string;
      city?: string;
      temperature?: string;
      createdAfter?: string;
      createdBefore?: string;
    },
  ) {
    return this.leadService.enqueueAnalysisForPending(teamId, body);
  }

  /**
   * Retorna timeline de eventos do lead.
   */
  @Get(':id/history')
  history(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.leadService.getHistory(teamId, id);
  }

  /**
   * Gera um prompt profissional para desenvolvimento de site personalizado ao lead.
   * Usa dados públicos do lead + templates de nicho para criar um prompt rico e acionável.
   */
  @Post(':id/generate-site-prompt')
  async generateSitePrompt(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
  ) {
    const lead = await this.leadService.findById(teamId, id);
    if (!lead) throw new NotFoundException('Lead não encontrado');
    const result = await this.aiService.generateSitePrompt(lead);
    return result;
  }

  /**
   * Gera análise comercial completa: resumo do negócio, objeções, roteiro de ligação,
   * mensagem de WhatsApp personalizada e prioridade de contato.
   */
  @Post(':id/commercial-analysis')
  async generateCommercialAnalysis(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
  ) {
    const lead = await this.leadService.findById(teamId, id);
    if (!lead) throw new NotFoundException('Lead não encontrado');
    const result = await this.aiService.generateCommercialAnalysis(lead);
    return result;
  }
}
