import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { ContractService } from './contract.service';
import {
  CreateContractDto,
  CreateContractTemplateDto,
  ListContractsQueryDto,
  UpdateContractDto,
  UpdateContractStatusDto,
} from './dto/contract.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class ContractController {
  constructor(private readonly contracts: ContractService) {}

  @Get()
  list(@CurrentTeam() teamId: string, @Query() q: ListContractsQueryDto) {
    return this.contracts.list(teamId, q);
  }

  @Get('dashboard')
  dashboard(@CurrentTeam() teamId: string) {
    return this.contracts.dashboardStats(teamId);
  }

  @Get('templates')
  listTemplates(@CurrentTeam() teamId: string) {
    return this.contracts.listTemplates(teamId);
  }

  @Post('templates')
  createTemplate(
    @CurrentTeam() teamId: string,
    @Body() dto: CreateContractTemplateDto,
  ) {
    return this.contracts.createTemplate(teamId, dto);
  }

  @Get('clauses')
  listClauses(@CurrentTeam() teamId: string) {
    return this.contracts.listClauses(teamId);
  }

  @Post('ai/clause')
  generateClause(
    @Body() body: { serviceType: string; clauseType: string; context?: string },
  ) {
    return this.contracts.generateClauseWithAI(body);
  }

  @Get('ai/quota')
  getAIQuota(@CurrentTeam() teamId: string) {
    return this.contracts.getAIContractQuota(teamId);
  }

  @Post('ai/generate')
  generateFullContract(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { description: string; category?: string; clientName?: string; totalValue?: number },
  ) {
    return this.contracts.generateFullContract(teamId, userId, body);
  }

  @Get(':id')
  findOne(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.contracts.findById(teamId, id);
  }

  @Get(':id/history')
  history(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.contracts.getHistory(teamId, id);
  }

  @Get(':id/review')
  reviewWithAI(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.contracts.reviewWithAI(teamId, id);
  }

  @Get(':id/export/pdf')
  async exportPdf(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buf = await this.contracts.exportPdf(teamId, userId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contrato-${id}.pdf"`,
    );
    res.send(buf);
  }

  @Get(':id/export/docx')
  async exportDocx(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buf = await this.contracts.exportDocx(teamId, userId, id);
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contrato-${id}.doc"`,
    );
    res.send(buf);
  }

  @Post()
  create(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.create(teamId, userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(teamId, userId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContractStatusDto,
  ) {
    return this.contracts.updateStatus(teamId, userId, id, dto.status);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.contracts.delete(teamId, userId, id);
  }
}
