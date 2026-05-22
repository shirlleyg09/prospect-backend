/**
 * @file public-proposal.controller.ts
 * @description
 *   Endpoints HTTP PÚBLICOS (sem autenticação) do módulo de Propostas.
 *
 *   Rotas:
 *     GET  /public/proposals/:slug              → busca proposta pública por slug
 *     POST /public/proposals/:slug/view         → registra visualização
 *     GET  /public/proposals/:slug/export/html  → download HTML standalone
 *     GET  /public/proposals/:slug/export/pdf   → download PDF (via Puppeteer)
 *
 *   Segurança:
 *     - Nunca retorna rascunhos (publish é obrigatório)
 *     - Retorna 404 pra slugs inválidos sem distinguir
 *     - Propostas expiradas → 403
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { TrackViewDto } from './dto/proposal.dto';
import { ProposalExportService } from './proposal-export.service';
import { ProposalService } from './proposal.service';

@Controller('public/proposals')
export class PublicProposalController {
  constructor(
    private readonly proposals: ProposalService,
    private readonly exporter: ProposalExportService,
  ) {}

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const p = await this.proposals.findByPublicSlug(slug);

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      publishedAt: p.publishedAt,
      expiresAt: p.expiresAt,
      content: p.content,
      plans: p.plans,
      paymentConditions: p.paymentConditions,
      lead: { name: p.lead.name },
      template: { category: p.template?.category ?? null },
      metadata: p.metadata as Record<string, unknown> | null,
    };
  }

  @Post(':slug/view')
  @HttpCode(204)
  async trackView(
    @Param('slug') slug: string,
    @Body() dto: TrackViewDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
    @Headers('referer') referer?: string,
  ) {
    const proposal = await this.proposals.findByPublicSlug(slug);

    const ip = extractIp(req);
    const ipHash = ip ? hashIp(ip, proposal.id) : undefined;

    await this.proposals.recordView({
      proposalId: proposal.id,
      sessionId: dto.sessionId,
      ipHash,
      userAgent: userAgent?.slice(0, 500),
      referer: referer?.slice(0, 500),
      readingTimeSec: dto.readingTimeSec,
      scrollDepthPct: dto.scrollDepthPct,
    });
  }

  /**
   * Download da proposta como HTML standalone.
   * Cliente pode salvar localmente, abrir offline, anexar em email.
   *
   * Query param `theme`:
   *   - 'dark' (default): preserva cores escuras da proposta
   *   - 'light': fundo branco/texto preto, ideal pra impressão
   */
  @Get(':slug/export/html')
  async exportHtml(
    @Param('slug') slug: string,
    @Query('theme') themeRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const theme: 'dark' | 'light' = themeRaw === 'light' ? 'light' : 'dark';
    const { html, filename } = await this.exporter.generateHtml(slug, theme);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(html);
  }

  /**
   * Download da proposta como PDF.
   * Render via Puppeteer headless Chrome (alta fidelidade).
   *
   * Query param `theme`:
   *   - 'dark' (default): preserva cores escuras (tema do app)
   *   - 'light': fundo branco/texto preto, ideal pra impressão
   */
  @Get(':slug/export/pdf')
  async exportPdf(
    @Param('slug') slug: string,
    @Query('theme') themeRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const theme: 'dark' | 'light' = themeRaw === 'light' ? 'light' : 'dark';
    const { pdf, filename } = await this.exporter.generatePdf(slug, theme);
    const buffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.end(buffer);
  }
}

function extractIp(req: Request): string | undefined {
  const xfwd = req.headers['x-forwarded-for'];
  if (typeof xfwd === 'string') return xfwd.split(',')[0].trim();
  if (Array.isArray(xfwd)) return xfwd[0];
  return req.socket?.remoteAddress ?? undefined;
}

function hashIp(ip: string, proposalId: string): string {
  return createHash('sha256').update(`${ip}:${proposalId}`).digest('hex');
}
