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
import type { Response } from 'express';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import {
  CreatePayableDto,
  CreateRevenueDto,
  ListFinanceQueryDto,
  UpdatePayableDto,
  UpdateReceivableDto,
  UpdateRevenueDto,
} from './finance.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // -------------------- DASHBOARD --------------------

  @Get('summary')
  getSummary(@CurrentTeam() teamId: string) {
    return this.finance.getSummary(teamId);
  }

  // -------------------- EXPORT --------------------

  /**
   * Exporta CSV (compatível com Excel — abre direto com encoding UTF-8 + BOM).
   */
  @Get('export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@CurrentTeam() teamId: string, @Res() res: Response) {
    const csv = await this.finance.exportToCsv(teamId);
    const filename = `financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /**
   * Exporta PDF — renderiza HTML via Puppeteer.
   */
  @Get('export/pdf')
  async exportPdf(@CurrentTeam() teamId: string, @Res() res: Response) {
    const html = await this.finance.exportToHtml(teamId);

    // Puppeteer dynamic import (evita peso no bootstrap se não usar)
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: 'new' as any,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const rawPdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      });
      const pdf: Buffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);

      const filename = `financeiro-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdf);
    } finally {
      await browser.close();
    }
  }

  // -------------------- REVENUES --------------------

  @Get('revenues')
  listRevenues(@CurrentTeam() teamId: string, @Query() q: ListFinanceQueryDto) {
    return this.finance.listRevenues(teamId, q);
  }

  @Post('revenues')
  createRevenue(@CurrentTeam() teamId: string, @Body() dto: CreateRevenueDto) {
    return this.finance.createRevenue(teamId, dto);
  }

  @Patch('revenues/:id')
  updateRevenue(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRevenueDto,
  ) {
    return this.finance.updateRevenue(teamId, id, dto);
  }

  @Delete('revenues/:id')
  @HttpCode(204)
  deleteRevenue(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.finance.deleteRevenue(teamId, id);
  }

  // -------------------- RECEIVABLES --------------------

  @Get('receivables')
  listReceivables(@CurrentTeam() teamId: string, @Query() q: ListFinanceQueryDto) {
    return this.finance.listReceivables(teamId, q);
  }

  @Patch('receivables/:id')
  markReceivablePaid(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReceivableDto,
  ) {
    return this.finance.markReceivablePaid(teamId, id, dto);
  }

  // -------------------- PAYABLES --------------------

  @Get('payables')
  listPayables(@CurrentTeam() teamId: string, @Query() q: ListFinanceQueryDto) {
    return this.finance.listPayables(teamId, q);
  }

  @Post('payables')
  createPayable(@CurrentTeam() teamId: string, @Body() dto: CreatePayableDto) {
    return this.finance.createPayable(teamId, dto);
  }

  @Patch('payables/:id')
  updatePayable(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePayableDto,
  ) {
    return this.finance.updatePayable(teamId, id, dto);
  }

  @Delete('payables/:id')
  @HttpCode(204)
  deletePayable(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.finance.deletePayable(teamId, id);
  }
}
