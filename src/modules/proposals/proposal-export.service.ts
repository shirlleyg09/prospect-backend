/**
 * @file proposal-export.service.ts
 * @description
 *   Geração de export da proposta em HTML standalone e PDF.
 *
 *   Estratégia HTML:
 *     - Renderização server-side em string com inline CSS
 *     - Self-contained: nenhuma dependência externa, fontes embarcadas via Google Fonts
 *     - Cliente pode salvar localmente, abrir offline, imprimir
 *
 *   Estratégia PDF:
 *     - Puppeteer (headless Chrome) carrega o HTML acima
 *     - Imprime em formato A4 com margens
 *     - Opcional: cabeçalho/rodapé com paginação
 *
 *   Por que NÃO usamos uma lib de PDF puro (pdfkit, jspdf):
 *     - Layout HTML é o que já temos. Reproduzir em pdfkit seria refazer tudo.
 *     - Puppeteer mantém fidelidade visual 1:1 com a página pública.
 *
 *   Importante: Puppeteer baixa Chrome ~150MB. Em desenvolvimento, instala junto
 *   com `npm install puppeteer`. Em produção, pode usar puppeteer-core + Chrome
 *   já existente no servidor pra economizar.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProposalExportService {
  private readonly logger = new Logger(ProposalExportService.name);
  // Lazy-load do Puppeteer (carrega só quando primeiro PDF é solicitado)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private puppeteer: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna o HTML standalone (string) da proposta — pronto pra download.
   * Não tem dependências externas (CSS inline + fontes via @import).
   */
  async generateHtml(
    slug: string,
    theme: 'dark' | 'light' = 'dark',
  ): Promise<{ html: string; filename: string }> {
    const proposal = await this.fetchPublicProposal(slug);
    const html = this.renderHtml(proposal, theme);
    const filename = `proposta-${proposal.lead.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}.html`;
    return { html, filename };
  }

  /**
   * Gera PDF (Buffer) usando Puppeteer.
   * Retorna o buffer bruto + filename sugerido.
   */
  async generatePdf(
    slug: string,
    theme: 'dark' | 'light' = 'dark',
  ): Promise<{ pdf: Buffer; filename: string }> {
    const proposal = await this.fetchPublicProposal(slug);
    const html = this.renderHtml(proposal, theme);

    let browser: any = null;
    let page: any = null;

    try {
      browser = await this.getBrowser();
      page = await browser.newPage();

      // Timeout pra evitar trava infinita do setContent
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Forçar mídia print pra garantir que media queries de print rodem
      await page.emulateMediaType('print');

      const rawPdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        preferCSSPageSize: false,
        timeout: 30_000,
      });

      // Puppeteer 22+ retorna Uint8Array; converte para Buffer pra Express
      const pdf: Buffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);

      const filename = `proposta-${proposal.lead.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}.pdf`;

      return { pdf, filename };
    } catch (err) {
      this.logger.error(
        `Falha ao gerar PDF: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Re-throw com mensagem amigável (vai virar 500 no Express, mas controlado)
      throw new Error(
        `Não foi possível gerar o PDF: ${(err as Error).message}. Tente o export HTML como alternativa.`,
      );
    } finally {
      if (page) {
        await page.close().catch(() => undefined);
      }
      // Não fechamos o browser aqui — ele é reutilizado entre requests.
      // Mas se o browser estiver corrompido, marcamos como null pra próxima
      // chamada relançar.
    }
  }

  /**
   * Garante que temos uma instância única de browser Puppeteer
   * (lançar Chromium é caro — reusar entre requests).
   *
   * Robustez:
   *   - Detecta browser morto (connected/isConnected) e relança automaticamente
   *   - Listener 'disconnected' marca null pra próxima chamada criar de novo
   *   - Flags adicionais que melhoram estabilidade em Windows
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getBrowser(): Promise<any> {
    // Verifica se browser ainda está vivo
    if (this.browser) {
      try {
        const isAlive =
          typeof this.browser.connected === 'boolean'
            ? this.browser.connected
            : typeof this.browser.isConnected === 'function'
              ? this.browser.isConnected()
              : true;
        if (isAlive) return this.browser;
      } catch {
        // Erro de conexão — vai relançar
      }
      this.logger.warn('Browser Puppeteer morreu — relançando...');
      this.browser = null;
    }

    if (!this.puppeteer) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        this.puppeteer = require('puppeteer');
      } catch {
        this.logger.error(
          'Puppeteer não instalado. Rode: npm install puppeteer --save',
        );
        throw new Error(
          'Geração de PDF não disponível: puppeteer não instalado no backend.',
        );
      }
    }

    this.logger.log('Iniciando Chromium para gerar PDF...');
    this.browser = await this.puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // Windows-specific helpers
        '--disable-features=VizDisplayCompositor',
      ],
      // Timeout pra launch (Chromium lento na primeira vez)
      timeout: 60_000,
    });

    // Listener: se browser morrer, marca null pra próxima chamada relançar
    this.browser.on('disconnected', () => {
      this.logger.warn('Browser Puppeteer desconectou — vai relançar na próxima chamada.');
      this.browser = null;
    });

    return this.browser;
  }

  /**
   * Limpa recursos no shutdown da aplicação.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
    }
  }

  // -------------------------------------------------------------------------
  // Privados
  // -------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchPublicProposal(slug: string): Promise<any> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { publicSlug: slug },
      include: { lead: { select: { name: true } } },
    });
    if (!proposal) {
      throw new NotFoundException('Proposta não encontrada');
    }
    if (proposal.status === 'RASCUNHO') {
      throw new NotFoundException('Proposta não publicada');
    }
    if (proposal.expiresAt && proposal.expiresAt < new Date()) {
      throw new NotFoundException('Proposta expirada');
    }
    return proposal;
  }

  /**
   * Renderiza HTML standalone.
   *
   * O HTML aqui é um espelho simplificado da página pública mas SEM
   * dependência de React/Next/Tailwind — usamos CSS inline no <style> com
   * variáveis pra tema, fontes do Google embarcadas via @import.
   *
   * @param theme 'dark' (default) preserva cores originais da proposta;
   *              'light' troca pra fundo branco/texto preto (ideal pra impressão).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderHtml(proposal: any, themeOverride: 'dark' | 'light' = 'dark'): string {
    const content: Section[] = Array.isArray(proposal.content)
      ? proposal.content
      : [];
    const plans: Plan[] = Array.isArray(proposal.plans) ? proposal.plans : [];
    const payment = proposal.paymentConditions as PaymentConditions | null;

    const sectionsHtml = content.map((s) => this.renderSection(s)).join('');
    const plansHtml = this.renderPlans(plans);
    const paymentHtml = payment ? this.renderPayment(payment) : '';

    const publishedAt = proposal.publishedAt
      ? new Date(proposal.publishedAt).toLocaleDateString('pt-BR')
      : '—';
    const expiresAt = proposal.expiresAt
      ? `Válida até ${new Date(proposal.expiresAt).toLocaleDateString('pt-BR')}`
      : '';

    // Lê tema customizado da proposta (metadata.theme); usa defaults se não tiver
    const customTheme = (proposal.metadata as { theme?: any })?.theme ?? {};

    // themeOverride (vindo da query string ?theme=light/dark) tem prioridade
    // sobre o background salvo na proposta — assim o usuário pode forçar modo
    // claro pra impressão sem mexer na proposta.
    const background: 'dark' | 'light' =
      themeOverride === 'light'
        ? 'light'
        : customTheme.background === 'light'
          ? 'light'
          : 'dark';

    // Cor primária: 8 opções predefinidas (mesmo set do frontend)
    const primaryColor: string = customTheme.primary ?? 'green';
    const primaryHexMap: Record<string, { hex: string; dim: string; fg: string }> = {
      green: { hex: '#00FF88', dim: '#00C76F', fg: '#0A0A0F' },
      blue: { hex: '#3B82F6', dim: '#1E5FCC', fg: '#FFFFFF' },
      red: { hex: '#EF4444', dim: '#DC2626', fg: '#FFFFFF' },
      purple: { hex: '#A855F7', dim: '#9333EA', fg: '#FFFFFF' },
      orange: { hex: '#F97316', dim: '#EA580C', fg: '#FFFFFF' },
      pink: { hex: '#EC4899', dim: '#DB2777', fg: '#FFFFFF' },
      black: { hex: '#1A1A22', dim: '#0A0A0F', fg: '#FFFFFF' },
      white: { hex: '#F5F5F7', dim: '#D4D4D8', fg: '#0A0A0F' },
    };
    const primary = primaryHexMap[primaryColor] ?? primaryHexMap.green;

    // Para gerar versões com alpha (rgba) sem complicar, convertemos hex -> rgb
    const rgb = hexToRgb(primary.hex);
    const primaryRgb = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

    // Paleta neutra muda conforme background
    const palette =
      background === 'light'
        ? `
    --primary: ${primary.hex};
    --primary-dim: ${primary.dim};
    --primary-rgb: ${primaryRgb};
    --button-fg: ${primary.fg};
    --bg: #FFFFFF;
    --surface: #F8F8FA;
    --card: #FFFFFF;
    --foreground: #0A0A0F;
    --muted: #6B7280;
    --border: #E4E4E7;
    --warm: #F59E0B;`
        : `
    --primary: ${primary.hex};
    --primary-dim: ${primary.dim};
    --primary-rgb: ${primaryRgb};
    --button-fg: ${primary.fg};
    --bg: #0A0A0F;
    --surface: #14141A;
    --card: #1A1A22;
    --foreground: #F5F5F7;
    --muted: #9CA3AF;
    --border: #2A2A35;
    --warm: #FBBF24;`;

    // Override de cor de texto se especificado pela proposta
    const textToneOverride =
      customTheme.textTone === 'light'
        ? '\n    --foreground: #F5F5F7;'
        : customTheme.textTone === 'dark'
          ? '\n    --foreground: #0A0A0F;'
          : '';

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(proposal.title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  /* Tema: ${background} | Cor: ${primaryColor}.
     printBackground: true no Puppeteer + print-color-adjust força preservação. */
  :root {${palette}${textToneOverride}
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
    color: var(--foreground);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
    /* CRÍTICO pra preservar fundo no print/PDF */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body { padding: 0; min-height: 100vh; }

  .container { max-width: 760px; margin: 0 auto; padding: 60px 40px; }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid rgba(var(--primary-rgb), 0.3);
    background: rgba(var(--primary-rgb), 0.08);
    color: var(--primary);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .doc-title { text-align: center; margin: 24px 0 8px; font-weight: 800; font-size: 28px; letter-spacing: -0.02em; }
  .doc-subtitle { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 60px; }

  .section { margin: 60px 0; page-break-inside: avoid; }

  .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .section-icon {
    width: 32px; height: 32px; border-radius: 8px;
    background: rgba(var(--primary-rgb), 0.15);
    display: flex; align-items: center; justify-content: center;
    color: var(--primary);
    font-size: 16px; font-weight: 700;
  }
  .section-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }

  /* Hero */
  .hero {
    background:
      radial-gradient(ellipse at top right, rgba(var(--primary-rgb), 0.12), transparent 60%),
      linear-gradient(135deg, rgba(var(--primary-rgb), 0.06), rgba(var(--primary-rgb), 0.02));
    border: 1px solid rgba(var(--primary-rgb), 0.25);
    border-radius: 16px;
    padding: 60px 40px;
    text-align: center;
  }
  .hero-headline { font-size: 38px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; }
  .hero-sub { color: var(--muted); margin-top: 16px; font-size: 16px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.6; }
  .hero-cta {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 32px;
    background: var(--primary);
    color: var(--button-fg);
    padding: 12px 24px; border-radius: 999px;
    font-weight: 700; font-size: 14px;
    box-shadow: 0 8px 24px rgba(var(--primary-rgb), 0.25);
  }

  /* Diagnostico */
  .diag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .diag-card { border: 1px solid var(--border); background: var(--card); border-radius: 12px; padding: 16px; display: flex; gap: 12px; }
  .diag-num { flex-shrink: 0; width: 28px; height: 28px; background: rgba(251, 191, 36, 0.15); color: var(--warm); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; }
  .diag-label { font-weight: 700; font-size: 14px; }
  .diag-desc { color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.5; }

  /* Solucao */
  .solucao-card { border: 1px solid rgba(var(--primary-rgb), 0.3); background: rgba(var(--primary-rgb), 0.06); border-radius: 12px; padding: 20px; line-height: 1.6; font-size: 14px; }

  /* Processo */
  .processo-step { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
  .processo-num {
    flex-shrink: 0; width: 36px; height: 36px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--button-fg);
    font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .processo-card { flex: 1; border: 1px solid var(--border); background: var(--card); border-radius: 12px; padding: 12px; }
  .processo-label { font-weight: 700; font-size: 14px; }
  .processo-desc { color: var(--muted); font-size: 12px; margin-top: 4px; }

  /* Item list (entregaveis / escopo) */
  .item-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .item-card { display: flex; align-items: flex-start; gap: 12px; border: 1px solid var(--border); background: var(--card); border-radius: 10px; padding: 12px; }
  .item-check { color: var(--primary); font-weight: 800; font-size: 14px; flex-shrink: 0; line-height: 1; }
  .item-label { font-weight: 600; font-size: 13px; }
  .item-desc { color: var(--muted); font-size: 11px; margin-top: 2px; }

  /* Prazo */
  .prazo-card { border: 1px solid var(--border); background: var(--card); border-radius: 12px; padding: 24px; text-align: center; }
  .prazo-text { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }

  /* Suporte */
  .suporte-card { border: 1px solid var(--border); background: var(--card); border-radius: 12px; padding: 20px; line-height: 1.6; font-size: 14px; }

  /* CTA */
  .cta {
    background:
      radial-gradient(ellipse at top, rgba(var(--primary-rgb), 0.15), transparent 60%),
      linear-gradient(135deg, rgba(var(--primary-rgb), 0.08), rgba(var(--primary-rgb), 0.02));
    border: 1px solid rgba(var(--primary-rgb), 0.3);
    border-radius: 16px;
    padding: 60px 40px;
    text-align: center;
  }
  .cta-title { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; }
  .cta-desc { color: var(--muted); margin-top: 12px; font-size: 14px; max-width: 400px; margin-left: auto; margin-right: auto; }
  .cta-btn {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 24px;
    background: var(--primary);
    color: var(--button-fg);
    padding: 12px 28px; border-radius: 999px;
    font-weight: 700; font-size: 14px;
    box-shadow: 0 8px 24px rgba(var(--primary-rgb), 0.25);
  }

  /* Plans */
  .plans-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .plan { border: 1px solid var(--border); background: var(--card); border-radius: 16px; padding: 24px; position: relative; display: flex; flex-direction: column; }
  .plan.highlighted {
    border-color: var(--primary);
    background: rgba(var(--primary-rgb), 0.06);
    box-shadow: 0 8px 32px rgba(var(--primary-rgb), 0.18);
  }
  .plan-badge {
    position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
    background: var(--primary);
    color: var(--button-fg);
    font-size: 9px; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.08em;
    padding: 4px 10px; border-radius: 999px;
  }
  .plan-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
  .plan-tagline { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .plan-price { font-size: 28px; font-weight: 800; color: var(--primary); margin-top: 16px; }
  .plan-features { border-top: 1px solid var(--border); margin-top: 16px; padding-top: 16px; flex: 1; }
  .plan-feature { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; margin-bottom: 8px; }
  .plan-feature-check { color: var(--primary); font-weight: 800; flex-shrink: 0; }

  /* Payment */
  .pay-card { border: 1px solid var(--border); background: var(--card); border-radius: 12px; padding: 20px; }
  .pay-section + .pay-section { border-top: 1px solid var(--border); margin-top: 16px; padding-top: 16px; }
  .pay-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); }
  .pay-methods { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pay-method { border: 1px solid var(--border); background: var(--surface); padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pay-terms { font-size: 14px; font-weight: 600; margin-top: 4px; }
  .pay-discount { color: var(--primary); font-size: 12px; margin-top: 8px; }

  /* Footer */
  .footer { border-top: 1px solid var(--border); padding: 32px 0; margin-top: 80px; text-align: center; color: var(--muted); }
  .footer-brand { font-size: 14px; font-weight: 800; color: var(--foreground); margin-top: 4px; }
  .footer-meta { font-size: 11px; margin-top: 8px; }

  /* Print — força fundo dark no PDF também */
  @media print {
    html, body {
      background: var(--bg) !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .container { padding: 20px; }
    .section { margin: 40px 0; }
    .hero, .cta { padding: 40px 30px; }
    .plans-grid { grid-template-columns: 1fr 1fr 1fr; }
  }

  @media (max-width: 600px) {
    .container { padding: 30px 20px; }
    .hero-headline { font-size: 28px; }
    .diag-grid, .item-grid { grid-template-columns: 1fr; }
    .plans-grid { grid-template-columns: 1fr; }
    .plan.highlighted { transform: none; }
  }
</style>
</head>
<body>
  <div class="container">
    <div style="text-align: center;">
      <span class="badge">✦ Proposta personalizada</span>
    </div>

    <h1 class="doc-title">${escapeHtml(proposal.title)}</h1>
    <p class="doc-subtitle">Para ${escapeHtml(proposal.lead.name)}</p>

    ${sectionsHtml}

    ${plansHtml}

    ${paymentHtml}

    <div class="footer">
      <div class="footer-meta">Powered by</div>
      <div class="footer-brand">Prospect</div>
      <div class="footer-meta">
        Proposta gerada em ${publishedAt}${expiresAt ? ' · ' + escapeHtml(expiresAt) : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private renderSection(section: Section): string {
    switch (section.kind) {
      case 'hero':
        return `<section class="section">
  <div class="hero">
    <h1 class="hero-headline">${escapeHtml(section.headline ?? '')}</h1>
    <p class="hero-sub">${escapeHtml(section.subheadline ?? '')}</p>
    ${section.ctaText ? `<div class="hero-cta">${escapeHtml(section.ctaText)} →</div>` : ''}
  </div>
</section>`;

      case 'diagnostico':
        return `<section class="section">
  <div class="section-header">
    <div class="section-icon">◎</div>
    <h2 class="section-title">${escapeHtml(section.title ?? 'Diagnóstico')}</h2>
  </div>
  <div class="diag-grid">
    ${(section.points ?? [])
      .map(
        (p: { label: string; description: string }, i: number) =>
          `<div class="diag-card">
        <div class="diag-num">${i + 1}</div>
        <div>
          <div class="diag-label">${escapeHtml(p.label ?? '')}</div>
          <div class="diag-desc">${escapeHtml(p.description ?? '')}</div>
        </div>
      </div>`,
      )
      .join('')}
  </div>
</section>`;

      case 'solucao':
        return `<section class="section">
  <div class="section-header">
    <div class="section-icon">💡</div>
    <h2 class="section-title">${escapeHtml(section.title ?? 'Solução')}</h2>
  </div>
  <div class="solucao-card">${escapeHtml(section.description ?? '')}</div>
</section>`;

      case 'processo':
        return `<section class="section">
  <div class="section-header">
    <div class="section-icon">→</div>
    <h2 class="section-title">${escapeHtml(section.title ?? 'Processo')}</h2>
  </div>
  ${(section.steps ?? [])
    .map(
      (s: { number: number; label: string; description: string }) =>
        `<div class="processo-step">
      <div class="processo-num">${s.number}</div>
      <div class="processo-card">
        <div class="processo-label">${escapeHtml(s.label ?? '')}</div>
        <div class="processo-desc">${escapeHtml(s.description ?? '')}</div>
      </div>
    </div>`,
    )
    .join('')}
</section>`;

      case 'escopoTecnico':
      case 'entregaveis':
        return `<section class="section">
  <div class="section-header">
    <div class="section-icon">✓</div>
    <h2 class="section-title">${escapeHtml(section.title ?? 'Itens')}</h2>
  </div>
  <div class="item-grid">
    ${(section.items ?? [])
      .map(
        (item: { label: string; description?: string }) =>
          `<div class="item-card">
        <div class="item-check">✓</div>
        <div>
          <div class="item-label">${escapeHtml(item.label ?? '')}</div>
          ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
        </div>
      </div>`,
      )
      .join('')}
  </div>
</section>`;

      case 'prazo':
        return `<section class="section">
  <div class="section-header">
    <div class="section-icon">⏱</div>
    <h2 class="section-title">${escapeHtml(section.title ?? 'Prazo')}</h2>
  </div>
  <div class="prazo-card">
    <div class="prazo-text">${escapeHtml(section.estimativa ?? '')}</div>
  </div>
</section>`;

      case 'suporte':
        return `<section class="section">
  <div class="section-header">
    <div class="section-icon">🤝</div>
    <h2 class="section-title">${escapeHtml(section.title ?? 'Suporte')}</h2>
  </div>
  <div class="suporte-card">${escapeHtml(section.description ?? '')}</div>
</section>`;

      case 'cta':
        return `<section class="section">
  <div class="cta">
    <h2 class="cta-title">${escapeHtml(section.headline ?? '')}</h2>
    <p class="cta-desc">${escapeHtml(section.description ?? '')}</p>
    ${section.buttonText ? `<div class="cta-btn">${escapeHtml(section.buttonText)} →</div>` : ''}
  </div>
</section>`;

      default:
        return '';
    }
  }

  private renderPlans(plans: Plan[]): string {
    if (plans.length === 0) return '';
    return `<section class="section">
  <div class="section-header">
    <div class="section-icon">✦</div>
    <h2 class="section-title">Planos e investimento</h2>
  </div>
  <div class="plans-grid">
    ${plans
      .map(
        (plan) => `<div class="plan${plan.highlighted ? ' highlighted' : ''}">
      ${plan.highlighted ? `<div class="plan-badge">Recomendado</div>` : ''}
      <div class="plan-name">${escapeHtml(plan.name ?? '')}</div>
      ${plan.tagline ? `<div class="plan-tagline">${escapeHtml(plan.tagline)}</div>` : ''}
      <div class="plan-price">${formatBRL(plan.price)}</div>
      <div class="plan-features">
        ${(plan.features ?? [])
          .map(
            (f) => `<div class="plan-feature">
          <span class="plan-feature-check">✓</span>
          <span>${escapeHtml(f)}</span>
        </div>`,
          )
          .join('')}
      </div>
    </div>`,
      )
      .join('')}
  </div>
</section>`;
  }

  private renderPayment(conditions: PaymentConditions): string {
    const labels: Record<string, string> = {
      PIX: 'PIX',
      CARD: 'Cartão',
      TRANSFER: 'Transferência',
      BOLETO: 'Boleto',
    };

    const methods = (conditions.methods ?? [])
      .map((m: string) => `<span class="pay-method">${labels[m] ?? m}</span>`)
      .join('');

    return `<section class="section">
  <div class="section-header">
    <div class="section-icon">🤝</div>
    <h2 class="section-title">Condições de pagamento</h2>
  </div>
  <div class="pay-card">
    <div class="pay-section">
      <div class="pay-label">Formas aceitas</div>
      <div class="pay-methods">${methods}</div>
    </div>
    <div class="pay-section">
      <div class="pay-label">Condições</div>
      <div class="pay-terms">${escapeHtml(conditions.terms ?? '')}</div>
      ${
        conditions.discountCash && conditions.discountCash > 0
          ? `<div class="pay-discount">💰 Desconto de ${conditions.discountCash}% para pagamento à vista</div>`
          : ''
      }
    </div>
  </div>
</section>`;
  }
}

// ===========================================================================
// Tipos auxiliares (cópia local para não acoplar com o frontend)
// ===========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Section = any;
type Plan = {
  tier: string;
  name: string;
  tagline?: string;
  price: number;
  features: string[];
  highlighted: boolean;
};
type PaymentConditions = {
  methods: string[];
  terms: string;
  discountCash?: number;
};

// ===========================================================================
// Helpers
// ===========================================================================

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

/**
 * Converte hex (#RRGGBB) pra triplet RGB.
 * Usado pra gerar rgba() dinâmicos no CSS.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}
