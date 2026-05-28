/**
 * @file export.service.ts
 * @description
 *   Gera exportações de leads em CSV, XLSX e PDF. Para volumes grandes,
 *   o método `enqueue` delega para a fila `export.generate` e o resultado
 *   fica disponível via URL assinada (S3/MinIO). Para volumes pequenos,
 *   `generateSync` devolve o buffer direto.
 */

import { Injectable } from '@nestjs/common';
import { Lead } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../database/prisma.service';
import { PgQueueService } from '../../queue/pg-queue.service';
import { QUEUE_EXPORT } from '../../queue/queue.constants';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportFilters {
  temperature?: string;
  niche?: string;
  minScore?: number;
  searchId?: string;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PgQueueService,
  ) {}

  /**
   * Geração síncrona — adequada até ~5k leads. Retorna Buffer + content-type.
   */
  async generateSync(
    teamId: string,
    format: ExportFormat,
    filters: ExportFilters = {},
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const leads = await this.prisma.lead.findMany({
      where: {
        teamId,
        ...(filters.searchId && { searchId: filters.searchId }),
        ...(filters.temperature && { temperature: filters.temperature as any }),
        ...(filters.niche && { niche: { contains: filters.niche, mode: 'insensitive' } }),
        ...(filters.minScore !== undefined && { leadScore: { gte: filters.minScore } }),
      },
      orderBy: { leadScore: 'desc' },
      take: 5000,
    });

    switch (format) {
      case 'csv':
        return {
          buffer: Buffer.from(this.toCsv(leads), 'utf8'),
          contentType: 'text/csv; charset=utf-8',
          filename: `leads-${Date.now()}.csv`,
        };
      case 'xlsx':
        return {
          buffer: await this.toXlsx(leads),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: `leads-${Date.now()}.xlsx`,
        };
      case 'pdf':
        return {
          buffer: await this.toPdf(leads),
          contentType: 'application/pdf',
          filename: `leads-${Date.now()}.pdf`,
        };
    }
  }

  /**
   * Para volumes grandes, enfileira um job e devolve o trackingId.
   * O worker salva o arquivo em storage e notifica via webhook/SSE.
   */
  async enqueue(teamId: string, format: ExportFormat, filters: ExportFilters) {
    const jobId = await this.queue.add(QUEUE_EXPORT, { teamId, format, filters });
    return { jobId, status: 'queued' };
  }

  // ---------------------------------------------------------------------------
  // FORMATTERS
  // ---------------------------------------------------------------------------

  private toCsv(leads: Lead[]): string {
    const headers = [
      'name', 'niche', 'phone', 'whatsapp', 'email', 'website', 'instagram',
      'city', 'state', 'googleRating', 'googleReviews', 'leadScore',
      'opportunityScore', 'temperature', 'estimatedTicket',
    ];

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = leads.map((l) =>
      headers.map((h) => escape((l as Record<string, unknown>)[h])).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private async toXlsx(leads: Lead[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Leads');

    ws.columns = [
      { header: 'Nome', key: 'name', width: 32 },
      { header: 'Nicho', key: 'niche', width: 20 },
      { header: 'Telefone', key: 'phone', width: 18 },
      { header: 'WhatsApp', key: 'whatsapp', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Site', key: 'website', width: 30 },
      { header: 'Instagram', key: 'instagram', width: 20 },
      { header: 'Cidade', key: 'city', width: 20 },
      { header: 'UF', key: 'state', width: 6 },
      { header: 'Nota Google', key: 'googleRating', width: 12 },
      { header: 'Reviews', key: 'googleReviews', width: 10 },
      { header: 'Score', key: 'leadScore', width: 8 },
      { header: 'Oportunidade', key: 'opportunityScore', width: 13 },
      { header: 'Temperatura', key: 'temperature', width: 13 },
      { header: 'Ticket Est.', key: 'estimatedTicket', width: 14 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6366F1' },
    };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    leads.forEach((l) => ws.addRow(l));

    // autofilter
    ws.autoFilter = { from: 'A1', to: `O${leads.length + 1}` };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer as ArrayBuffer);
  }

  private async toPdf(leads: Lead[]): Promise<Buffer> {
    // Gera HTML formatado e renderiza com Puppeteer (mesmo padrão do financeiro).
    // Substitui PDFKit programático que produzia layout embaralhado.
    const html = this.renderLeadsHtml(leads);

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
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      const rawPdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      });
      return Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);
    } finally {
      await browser.close();
    }
  }

  /**
   * Gera HTML formatado dos leads — visual limpo, tabela bem espaçada,
   * cores, headers fixos. Renderizado pelo Puppeteer como PDF.
   */
  private renderLeadsHtml(leads: Lead[]): string {
    const today = new Date().toLocaleDateString('pt-BR');
    const total = leads.length;

    // Stats agregadas pra mostrar no topo
    const tempCounts = leads.reduce<Record<string, number>>((acc, l) => {
      const t = l.temperature ?? 'UNCLASSIFIED';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    const avgScore =
      leads.filter((l) => l.leadScore != null).reduce((s, l) => s + (l.leadScore ?? 0), 0) /
      Math.max(1, leads.filter((l) => l.leadScore != null).length);

    const tempVisual: Record<string, { label: string; color: string }> = {
      HOT: { label: 'Quente', color: '#dc2626' },
      WARM: { label: 'Morno', color: '#f59e0b' },
      COLD: { label: 'Frio', color: '#3b82f6' },
      UNCLASSIFIED: { label: 'Não classificado', color: '#9ca3af' },
    };

    const escape = (s: string | null | undefined) => {
      if (!s) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const rows = leads
      .map((l, i) => {
        const tv = tempVisual[l.temperature ?? 'UNCLASSIFIED'] ?? tempVisual.UNCLASSIFIED;
        const score = l.leadScore != null ? `${l.leadScore}` : '—';
        const ticket = l.estimatedTicket
          ? `R$ ${Number(l.estimatedTicket).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
          : '—';
        const local = [l.city, l.state].filter(Boolean).join('/') || '—';
        const contato = l.phone || l.email || l.website || '—';

        return `
          <tr>
            <td style="text-align: center; color: #94a3b8; font-size: 10px;">${i + 1}</td>
            <td>
              <div style="font-weight: 700; font-size: 12px; color: #0f172a;">${escape(l.name)}</div>
              ${l.niche ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${escape(l.niche)}</div>` : ''}
            </td>
            <td style="font-size: 11px; color: #334155;">${escape(local)}</td>
            <td style="font-size: 10px; color: #475569;">${escape(contato)}</td>
            <td style="text-align: center;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 999px; background: ${tv.color}15; color: ${tv.color}; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">
                ${tv.label}
              </span>
            </td>
            <td style="text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; color: #0f172a;">
              ${score}
            </td>
            <td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; color: #16a34a; font-size: 11px;">
              ${ticket}
            </td>
          </tr>
        `;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Leads</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif;
    color: #0f172a;
    padding: 24px;
    font-size: 12px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 2px solid #00ff88;
  }
  .meta {
    font-size: 10px;
    color: #64748b;
    text-align: right;
    line-height: 1.6;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-bottom: 20px;
  }
  .card {
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #f8fafc;
  }
  .card-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.06em;
  }
  .card-value {
    font-size: 16px;
    font-weight: 800;
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
  }
  .card-value.hot { color: #dc2626; }
  .card-value.warm { color: #f59e0b; }
  .card-value.cold { color: #3b82f6; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    table-layout: fixed;
  }
  thead {
    /* Repete header em cada página */
    display: table-header-group;
  }
  th {
    background: #1e293b;
    color: #fff;
    padding: 8px 10px;
    text-align: left;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  th.center { text-align: center; }
  th.right { text-align: right; }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
    word-wrap: break-word;
    overflow: hidden;
  }
  tr {
    /* Não quebrar uma linha entre páginas */
    page-break-inside: avoid;
  }
  tbody tr:nth-child(even) { background: #fafbfc; }
  .empty {
    padding: 32px;
    text-align: center;
    color: #94a3b8;
    font-style: italic;
  }
  .footer {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 9px;
    color: #94a3b8;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório de Leads</h1>
      <p style="font-size: 11px; color: #64748b; margin-top: 4px;">
        Lista completa de leads identificados pelo sistema de prospecção
      </p>
    </div>
    <div class="meta">
      <p>Gerado em ${today}</p>
      <p>Prospect — Prospecção B2B</p>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="card-label">Total</div>
      <div class="card-value">${total}</div>
    </div>
    <div class="card">
      <div class="card-label">Quentes</div>
      <div class="card-value hot">${tempCounts.HOT ?? 0}</div>
    </div>
    <div class="card">
      <div class="card-label">Mornos</div>
      <div class="card-value warm">${tempCounts.WARM ?? 0}</div>
    </div>
    <div class="card">
      <div class="card-label">Frios</div>
      <div class="card-value cold">${tempCounts.COLD ?? 0}</div>
    </div>
    <div class="card">
      <div class="card-label">Score médio</div>
      <div class="card-value">${avgScore.toFixed(0)}</div>
    </div>
  </div>

  ${
    leads.length === 0
      ? '<div class="empty">Nenhum lead encontrado com os filtros aplicados</div>'
      : `
  <table>
    <colgroup>
      <col style="width: 4%">
      <col style="width: 24%">
      <col style="width: 14%">
      <col style="width: 22%">
      <col style="width: 12%">
      <col style="width: 8%">
      <col style="width: 16%">
    </colgroup>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Empresa</th>
        <th>Localização</th>
        <th>Contato</th>
        <th class="center">Temperatura</th>
        <th class="center">Score</th>
        <th class="right">Ticket Est.</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
  }

  <div class="footer">
    Relatório gerado automaticamente pelo Prospect · ${today}
  </div>
</body>
</html>`;
  }
}
