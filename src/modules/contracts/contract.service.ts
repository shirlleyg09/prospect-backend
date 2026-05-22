import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Contract, ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/services/ai.service';
import {
  CreateContractDto,
  CreateContractTemplateDto,
  ListContractsQueryDto,
  UpdateContractDto,
} from './dto/contract.dto';
import { SYSTEM_CLAUSES, SYSTEM_TEMPLATES } from './seed/contract-templates.seed';

@Injectable()
export class ContractService implements OnModuleInit {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AIService) private readonly ai: AIService,
  ) {}

  async onModuleInit() {
    await this.seedSystemTemplates();
    await this.seedSystemClauses();
  }

  // =========================================================================
  // SEED de templates e cláusulas (chamado no boot)
  // =========================================================================

  private async seedSystemTemplates() {
    for (const tpl of SYSTEM_TEMPLATES) {
      const existing = await this.prisma.contractTemplate.findFirst({
        where: { isSystem: true, name: tpl.name },
      });
      if (existing) continue;

      await this.prisma.contractTemplate.create({
        data: {
          teamId: null,
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          content: tpl.content,
          variables: tpl.variables,
          isSystem: true,
          isActive: true,
        },
      });
      this.logger.log(`ContractTemplate global seedado: ${tpl.name}`);
    }
  }

  private async seedSystemClauses() {
    for (const cl of SYSTEM_CLAUSES) {
      const existing = await this.prisma.contractClause.findFirst({
        where: { isSystem: true, title: cl.title },
      });
      if (existing) continue;

      await this.prisma.contractClause.create({
        data: {
          teamId: null,
          title: cl.title,
          category: cl.category,
          content: cl.content,
          isSystem: true,
        },
      });
    }
  }

  // =========================================================================
  // NUMERAÇÃO AUTOMÁTICA: CTR-2026-0001
  // =========================================================================

  private async generateNumber(teamId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CTR-${year}-`;

    // Procura o último contrato do ano pra incrementar
    const last = await this.prisma.contract.findFirst({
      where: {
        teamId,
        number: { startsWith: prefix },
      },
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    let nextSeq = 1;
    if (last) {
      const lastSeq = parseInt(last.number.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  // =========================================================================
  // VARIÁVEIS — substituir {{nome_cliente}} pelos valores reais
  // =========================================================================

  /**
   * Pré-preenche variáveis baseado nos dados do contrato.
   * Não persiste — só retorna o objeto com os valores.
   */
  resolveVariables(contract: Contract): Record<string, string> {
    const fmtCurrency = (v: number | null | undefined) =>
      v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const fmtDate = (d: Date | null | undefined) =>
      d ? new Date(d).toLocaleDateString('pt-BR') : '';

    return {
      nome_cliente: contract.clientName ?? '',
      cpf_cnpj: contract.clientDocument ?? '',
      endereco_cliente: contract.clientAddress ?? '',
      email_cliente: contract.clientEmail ?? '',
      telefone_cliente: contract.clientPhone ?? '',
      nome_empresa: contract.companyName ?? '',
      cnpj_empresa: contract.companyCnpj ?? '',
      endereco_empresa: contract.companyAddress ?? '',
      email_empresa: contract.companyEmail ?? '',
      telefone_empresa: contract.companyPhone ?? '',
      site_empresa: contract.companyWebsite ?? '',
      valor_proposta: fmtCurrency(contract.totalValue),
      forma_pagamento: contract.paymentTerms ?? '',
      servico_contratado: contract.contractedItems ?? '',
      data_inicio: fmtDate(contract.startDate),
      data_vencimento: fmtDate(contract.endDate),
      data_assinatura: fmtDate(contract.signedAt) || fmtDate(new Date()),
      numero_contrato: contract.number,
      // mescla com variáveis customizadas do usuário
      ...((contract.variables as Record<string, string>) ?? {}),
    };
  }

  /**
   * Substitui {{var}} pelo valor correspondente.
   * Se a variável estiver vazia, deixa em branco (não exibe {{var}} cru).
   */
  applyVariables(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const v = variables[key];
      if (v === undefined) return `{{${key}}}`; // variável desconhecida — mantém pra usuário ver
      return v; // string vazia também é resultado válido (não mostra {{var}})
    });
  }

  // =========================================================================
  // CRUD
  // =========================================================================

  async create(teamId: string, userId: string, dto: CreateContractDto): Promise<Contract> {
    const number = await this.generateNumber(teamId);

    // Se vinculado a template, copia o conteúdo
    let content = dto.content ?? '';
    if (dto.templateId && !content) {
      const template = await this.prisma.contractTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (template) content = template.content;
    }

    // Se vinculado a proposta, pré-preenche dados
    let proposalData: Partial<CreateContractDto> = {};
    if (dto.proposalId) {
      const proposal = await this.prisma.proposal.findFirst({
        where: { id: dto.proposalId, teamId },
        include: { lead: true },
      });
      if (proposal) {
        const meta = (proposal.metadata as Record<string, unknown>) ?? {};
        const approvedPlan = meta.approvedPlan as
          | { name: string; price: number }
          | undefined;
        const plans = Array.isArray(proposal.plans) ? proposal.plans : [];
        const fallbackPlan = (plans as any[]).find((p) => p.highlighted) ?? plans[0];
        const selectedPlan = approvedPlan ?? fallbackPlan;

        proposalData = {
          leadId: proposal.leadId,
          totalValue: (selectedPlan as any)?.price,
          contractedItems: proposal.title,
        };

        // Dados do lead
        if (proposal.lead) {
          proposalData.clientName = proposal.lead.name;
          proposalData.clientDocument = proposal.lead.cnpj ?? undefined;
          proposalData.clientEmail = proposal.lead.email ?? undefined;
          proposalData.clientPhone = proposal.lead.phone ?? undefined;
        }
      }
    }

    const contract = await this.prisma.contract.create({
      data: {
        teamId,
        number,
        title: dto.title,
        category: dto.category ?? 'PERSONALIZADO',
        templateId: dto.templateId,
        proposalId: dto.proposalId,
        leadId: dto.leadId ?? proposalData.leadId,
        createdById: userId,
        content,
        clientName: dto.clientName ?? proposalData.clientName,
        clientDocument: dto.clientDocument ?? proposalData.clientDocument,
        clientEmail: dto.clientEmail ?? proposalData.clientEmail,
        clientPhone: dto.clientPhone ?? proposalData.clientPhone,
        clientAddress: dto.clientAddress,
        companyName: dto.companyName,
        companyCnpj: dto.companyCnpj,
        companyEmail: dto.companyEmail,
        companyPhone: dto.companyPhone,
        companyWebsite: dto.companyWebsite,
        companyAddress: dto.companyAddress,
        companyLogoUrl: dto.companyLogoUrl,
        totalValue: dto.totalValue ?? proposalData.totalValue,
        paymentTerms: dto.paymentTerms,
        contractedItems: dto.contractedItems ?? proposalData.contractedItems,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        variables: dto.variables as Prisma.InputJsonValue,
        showWatermark: dto.showWatermark ?? false,
        themeColor: dto.themeColor,
        status: 'RASCUNHO',
      },
    });

    await this.recordEvent(contract.id, userId, 'CREATED', {
      description: `Contrato criado (${number})`,
    });

    this.logger.log(`Contrato criado: ${number} (team=${teamId})`);
    return contract;
  }

  async list(teamId: string, q: ListContractsQueryDto) {
    const page = q.page ?? 1;
    const perPage = q.perPage ?? 25;

    const where: Prisma.ContractWhereInput = {
      teamId,
      deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(q.category && { category: q.category }),
      ...(q.leadId && { leadId: q.leadId }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { number: { contains: q.search, mode: 'insensitive' } },
          { clientName: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          lead: { select: { id: true, name: true } },
          proposal: { select: { id: true, title: true } },
          template: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async findById(teamId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, teamId, deletedAt: null },
      include: {
        lead: true,
        proposal: { select: { id: true, title: true, status: true } },
        template: { select: { id: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado');
    return contract;
  }

  async update(
    teamId: string,
    userId: string,
    id: string,
    dto: UpdateContractDto,
  ): Promise<Contract> {
    const existing = await this.findById(teamId, id);

    // Se assinado, não permite editar
    if (existing.status === 'ASSINADO') {
      throw new ForbiddenException(
        'Contrato já assinado não pode ser editado. Crie um aditivo contratual.',
      );
    }

    const data: Prisma.ContractUpdateInput = {};
    const fields: Array<keyof UpdateContractDto> = [
      'title', 'category', 'content',
      'clientName', 'clientDocument', 'clientEmail', 'clientPhone', 'clientAddress',
      'companyName', 'companyCnpj', 'companyEmail', 'companyPhone',
      'companyWebsite', 'companyAddress', 'companyLogoUrl',
      'totalValue', 'paymentTerms', 'contractedItems',
      'showWatermark', 'themeColor', 'fontFamily',
    ];
    for (const k of fields) {
      if (dto[k] !== undefined) (data as any)[k] = dto[k];
    }
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.variables !== undefined) data.variables = dto.variables as Prisma.InputJsonValue;

    const updated = await this.prisma.contract.update({
      where: { id },
      data,
    });

    await this.recordEvent(id, userId, 'UPDATED', {
      description: 'Contrato editado',
    });

    return updated;
  }

  async updateStatus(
    teamId: string,
    userId: string,
    id: string,
    status: ContractStatus,
  ) {
    const existing = await this.findById(teamId, id);

    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        status,
        ...(status === 'ASSINADO' && { signedAt: new Date() }),
      },
    });

    await this.recordEvent(id, userId, 'STATUS_CHANGED', {
      description: `Status: ${existing.status} → ${status}`,
      from: existing.status,
      to: status,
    });

    return updated;
  }

  async delete(teamId: string, userId: string, id: string) {
    await this.findById(teamId, id);

    // Soft delete pra preservar histórico
    await this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELADO' },
    });

    await this.recordEvent(id, userId, 'DELETED', {
      description: 'Contrato excluído (soft delete)',
    });

    return { deleted: true };
  }

  // =========================================================================
  // TEMPLATES
  // =========================================================================

  async listTemplates(teamId: string) {
    return this.prisma.contractTemplate.findMany({
      where: {
        OR: [{ isSystem: true }, { teamId }],
        isActive: true,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createTemplate(
    teamId: string,
    dto: CreateContractTemplateDto,
  ) {
    return this.prisma.contractTemplate.create({
      data: {
        teamId,
        name: dto.name,
        description: dto.description,
        category: dto.category ?? 'PERSONALIZADO',
        content: dto.content,
        isSystem: false,
        isActive: true,
      },
    });
  }

  // =========================================================================
  // CLÁUSULAS (biblioteca)
  // =========================================================================

  async listClauses(teamId: string) {
    return this.prisma.contractClause.findMany({
      where: {
        OR: [{ isSystem: true }, { teamId }],
      },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  // =========================================================================
  // EXPORTAÇÃO PDF / DOCX
  // =========================================================================

  /**
   * Gera HTML do contrato com variáveis resolvidas e markdown convertido.
   * Compartilhado entre exportação PDF e DOCX.
   */
  private renderContractHtml(contract: Contract): string {
    const vars = this.resolveVariables(contract);
    const rendered = this.applyVariables(contract.content, vars);
    const html = this.markdownToHtml(rendered);
    const today = new Date().toLocaleDateString('pt-BR');
    const themeColor = contract.themeColor || '#00aa55';

    // Fonte: Arial | Montserrat | Georgia. Default Arial.
    // Para Montserrat carregamos via Google Fonts.
    const font = (contract.fontFamily ?? 'Arial').trim();
    const fontStack: Record<string, string> = {
      Arial: '"Arial", Helvetica, sans-serif',
      Montserrat: '"Montserrat", Arial, sans-serif',
      Georgia: '"Georgia", "Times New Roman", serif',
    };
    const usedFontFamily = fontStack[font] ?? fontStack.Arial;
    const googleFontsLink =
      font === 'Montserrat'
        ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" rel="stylesheet">'
        : '';

    // Bloco de assinaturas automático
    const signatureBlock = `
      <div class="signatures">
        <div class="sig-pair">
          <div class="sig-line"></div>
          <p class="sig-name"><strong>${escapeHtml(contract.clientName || '_________________________')}</strong></p>
          <p class="sig-role">CONTRATANTE${contract.clientDocument ? `<br>CPF/CNPJ: ${escapeHtml(contract.clientDocument)}` : ''}</p>
        </div>
        <div class="sig-pair">
          <div class="sig-line"></div>
          <p class="sig-name"><strong>${escapeHtml(contract.companyName || '_________________________')}</strong></p>
          <p class="sig-role">CONTRATADA${contract.companyCnpj ? `<br>CNPJ: ${escapeHtml(contract.companyCnpj)}` : ''}</p>
        </div>
      </div>
    `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${contract.number} - ${escapeHtml(contract.title)}</title>
${googleFontsLink}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${usedFontFamily};
    color: #000;
    background: #fff;
    padding: 0;
    font-size: 11pt;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    position: relative;
  }
  ${
    contract.showWatermark
      ? `
  body::before {
    content: "RASCUNHO";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 120pt;
    font-weight: 900;
    color: rgba(0,0,0,0.06);
    z-index: 0;
    pointer-events: none;
  }
  `
      : ''
  }
  /* Cabeçalho preto fixo no topo */
  .system-header {
    background: #000;
    color: #fff;
    padding: 14px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 3px solid ${themeColor};
  }
  .system-header .logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .system-header .logo-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: ${themeColor};
    color: #000;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 14pt;
    font-family: ${usedFontFamily};
  }
  .system-header .logo-text {
    font-size: 14pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: #fff;
  }
  .system-header .doc-info {
    text-align: right;
    font-size: 8pt;
    color: rgba(255,255,255,0.7);
    line-height: 1.4;
  }
  .system-header .doc-info strong {
    color: #fff;
    font-weight: 700;
  }
  .page-content {
    padding: 32px 40px;
  }
  .doc-title {
    margin-bottom: 24px;
    padding-bottom: 14px;
    border-bottom: 1px solid #ddd;
  }
  .doc-title h1 {
    font-size: 18pt;
    font-weight: 700;
    color: #000;
  }
  .doc-title .num {
    font-size: 9pt;
    color: #555;
    margin-top: 4px;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .content { position: relative; z-index: 1; color: #000; }
  .content h1 { font-size: 16pt; margin: 24px 0 12px; font-weight: 700; color: #000; }
  .content h2 { font-size: 13pt; margin: 20px 0 10px; font-weight: 700; color: #000; }
  .content h3 { font-size: 11pt; margin: 14px 0 8px; font-weight: 700; color: #000; }
  .content p { margin-bottom: 10px; text-align: justify; color: #000; }
  .content ul, .content ol { margin: 8px 0 8px 28px; }
  .content li { margin-bottom: 4px; color: #000; }
  .content strong { font-weight: 700; }
  .content em { font-style: italic; }
  .content hr { border: 0; border-top: 1px solid #ccc; margin: 18px 0; }
  .signatures {
    margin-top: 60px;
    display: flex;
    justify-content: space-between;
    gap: 40px;
    page-break-inside: avoid;
  }
  .sig-pair { flex: 1; text-align: center; }
  .sig-line {
    border-top: 1px solid #000;
    margin-bottom: 6px;
    height: 40px;
  }
  .sig-name {
    font-size: 10pt;
    color: #000;
    margin: 0;
  }
  .sig-role {
    font-size: 9pt;
    color: #555;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .footer {
    margin-top: 40px;
    padding: 16px 40px;
    border-top: 1px solid #ddd;
    font-size: 8pt;
    color: #777;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="system-header">
    <div class="logo">
      <span class="logo-icon">P</span>
      <span class="logo-text">PROSPECT</span>
    </div>
    <div class="doc-info">
      <strong>${escapeHtml(contract.number)}</strong><br>
      Gerado em ${today}
    </div>
  </div>
  <div class="page-content">
    <div class="doc-title">
      <h1>${escapeHtml(contract.title)}</h1>
      ${
        contract.companyName
          ? `<p class="num" style="margin-top:8px;font-family:${usedFontFamily};text-transform:none;font-size:10pt;color:#333;">
              <strong>${escapeHtml(contract.companyName)}</strong>${
                contract.companyCnpj ? ` &middot; CNPJ ${escapeHtml(contract.companyCnpj)}` : ''
              }
            </p>`
          : ''
      }
    </div>
    <div class="content">${html}</div>
    ${signatureBlock}
  </div>
  <div class="footer">
    Documento ${escapeHtml(contract.number)} &middot; Gerado pelo Prospect &mdash; Sistema de Gestão Comercial
  </div>
</body>
</html>`;
  }

  /**
   * Conversor markdown → HTML.
   * Suporta: # ## ### títulos, **bold**, *italic*, listas (- item), parágrafos,
   * --- (hr), `code` inline. Suficiente pros templates de contrato.
   */
  private markdownToHtml(md: string): string {
    let html = md;

    // Escape inicial
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Hr
    html = html.replace(/^---+$/gm, '<hr>');

    // Headers (3 antes do 2 antes do 1, importante)
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold + italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Listas — agrupa itens consecutivos
    const lines = html.split('\n');
    const out: string[] = [];
    let inList = false;
    for (const line of lines) {
      if (/^- /.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${line.replace(/^- /, '')}</li>`);
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push('</ul>');
    html = out.join('\n');

    // Parágrafos: blocos separados por linha vazia que NÃO sejam tags HTML
    html = html
      .split(/\n\n+/)
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (/^<(h\d|ul|ol|hr|p|div|table|blockquote)/i.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    // Underscore literais (linhas de assinatura tipo \_\_\_\_)
    html = html.replace(/\\_/g, '_');

    return html;
  }

  /**
   * Exporta contrato como PDF usando Puppeteer.
   * Mesma estratégia do PDF de leads/financeiro: HTML → headless Chrome → PDF.
   */
  async exportPdf(teamId: string, userId: string, id: string): Promise<Buffer> {
    const contract = await this.findById(teamId, id);
    const html = this.renderContractHtml(contract);

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: 'new' as any,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const raw = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
      });
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

      await this.recordEvent(id, userId, 'EXPORTED', {
        description: `Exportado como PDF`,
        format: 'pdf',
      });

      return buffer;
    } finally {
      await browser.close();
    }
  }

  /**
   * Exporta contrato como DOCX (Word).
   * Estratégia: gera HTML compatível com Word — Word abre HTML perfeitamente
   * e converte pra layout editável. Mais simples que gerar DOCX nativo.
   * Arquivo é salvo com extensão .doc e content-type application/msword.
   */
  async exportDocx(teamId: string, userId: string, id: string): Promise<Buffer> {
    const contract = await this.findById(teamId, id);
    const html = this.renderContractHtml(contract);

    // Wrapping específico pro Word ler como documento
    const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>90</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
</head>
<body>${html}</body>
</html>`;

    await this.recordEvent(id, userId, 'EXPORTED', {
      description: `Exportado como Word`,
      format: 'docx',
    });

    return Buffer.from(wordHtml, 'utf8');
  }

  // =========================================================================
  // DASHBOARD
  // =========================================================================

  async dashboardStats(teamId: string) {
    const [total, byStatus, totalValueAgg, expiringIn7Days] = await Promise.all([
      this.prisma.contract.count({ where: { teamId, deletedAt: null } }),
      this.prisma.contract.groupBy({
        by: ['status'],
        where: { teamId, deletedAt: null },
        _count: true,
      }),
      this.prisma.contract.aggregate({
        where: { teamId, deletedAt: null, status: 'ASSINADO' },
        _sum: { totalValue: true },
      }),
      this.prisma.contract.count({
        where: {
          teamId,
          deletedAt: null,
          status: 'AGUARDANDO_ASSINATURA',
          expiresAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[s.status] = s._count;

    return {
      total,
      signedValue: totalValueAgg._sum.totalValue ?? 0,
      expiringIn7Days,
      byStatus: {
        RASCUNHO: statusMap.RASCUNHO ?? 0,
        EM_EDICAO: statusMap.EM_EDICAO ?? 0,
        AGUARDANDO_ASSINATURA: statusMap.AGUARDANDO_ASSINATURA ?? 0,
        ASSINADO: statusMap.ASSINADO ?? 0,
        CANCELADO: statusMap.CANCELADO ?? 0,
        EXPIRADO: statusMap.EXPIRADO ?? 0,
        ARQUIVADO: statusMap.ARQUIVADO ?? 0,
      },
    };
  }

  // =========================================================================
  // IA — gerar cláusula e revisar contrato
  // =========================================================================

  async generateClauseWithAI(args: {
    serviceType: string;
    clauseType: string;
    context?: string;
  }) {
    return this.ai.generateContractClause(args);
  }

  async reviewWithAI(teamId: string, id: string) {
    const contract = await this.findById(teamId, id);
    const vars = this.resolveVariables(contract);
    const rendered = this.applyVariables(contract.content, vars);
    return this.ai.reviewContract(rendered);
  }

  // =========================================================================
  // IA — gerar contrato COMPLETO (tem quota mensal por team)
  // =========================================================================

  /**
   * Verifica quota antes de gerar com IA.
   * Plano free = 3 contratos AI por mês. Premium pode ter mais.
   */
  private async checkAIContractQuota(teamId: string): Promise<{ used: number; quota: number; remaining: number }> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { aiContractsQuota: true, aiContractsUsed: true },
    });
    if (!team) throw new NotFoundException('Team não encontrado');

    const remaining = team.aiContractsQuota - team.aiContractsUsed;
    return {
      used: team.aiContractsUsed,
      quota: team.aiContractsQuota,
      remaining,
    };
  }

  async getAIContractQuota(teamId: string) {
    return this.checkAIContractQuota(teamId);
  }

  async generateFullContract(
    teamId: string,
    userId: string,
    args: {
      description: string;
      category?: string;
      clientName?: string;
      totalValue?: number;
    },
  ): Promise<Contract> {
    const quota = await this.checkAIContractQuota(teamId);
    if (quota.remaining <= 0) {
      throw new ForbiddenException(
        `Quota de contratos por IA atingida (${quota.used}/${quota.quota}). ` +
        `Faça upgrade do plano para gerar mais contratos.`,
      );
    }

    // IA gera o contrato completo
    const aiResult = await this.ai.completeWithJson({
      system: `Você é um especialista em contratos comerciais brasileiros.
Gere um contrato profissional COMPLETO em markdown, em português.
Use variáveis no formato {{nome_cliente}}, {{cpf_cnpj}}, {{nome_empresa}}, {{cnpj_empresa}}, {{valor_proposta}}, {{forma_pagamento}}, {{servico_contratado}}, {{data_inicio}}, {{data_vencimento}}, {{numero_contrato}}, {{data_assinatura}}.
Estrutura obrigatória:
- # Título
- Identificação das partes (CONTRATANTE e CONTRATADA com variáveis)
- ## CLÁUSULA 1ª — DO OBJETO
- ## CLÁUSULA 2ª — DO VALOR E PAGAMENTO
- ## CLÁUSULA 3ª — DO PRAZO
- ## CLÁUSULA 4ª — DAS OBRIGAÇÕES
- ## CLÁUSULA 5ª — DA RESCISÃO
- ## CLÁUSULA 6ª — CONFIDENCIALIDADE E LGPD
- ## CLÁUSULA 7ª — DO FORO
- Local e data
NÃO inclua bloco de assinaturas — eles são gerados automaticamente pelo sistema.
Retorne APENAS JSON: {"title":"...","content":"markdown completo..."}`,
      user: `Descrição do serviço/contrato: ${args.description}
${args.category ? `Categoria: ${args.category}` : ''}
${args.clientName ? `Cliente: ${args.clientName}` : ''}
${args.totalValue ? `Valor: R$ ${args.totalValue.toLocaleString('pt-BR')}` : ''}

Gere o contrato profissional completo.`,
      temperature: 0.4,
      tag: 'generateFullContract',
    });

    const parsed = JSON.parse(
      aiResult.text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim(),
    ) as { title: string; content: string };

    // Cria o contrato
    const number = await this.generateNumber(teamId);
    const contract = await this.prisma.contract.create({
      data: {
        teamId,
        number,
        title: parsed.title || args.description.slice(0, 100),
        category: (args.category as any) ?? 'PERSONALIZADO',
        createdById: userId,
        content: parsed.content,
        clientName: args.clientName,
        totalValue: args.totalValue,
        status: 'RASCUNHO',
      },
    });

    // Incrementa contador de uso
    await this.prisma.team.update({
      where: { id: teamId },
      data: { aiContractsUsed: { increment: 1 } },
    });

    await this.recordEvent(contract.id, userId, 'CREATED', {
      description: `Contrato gerado por IA (${number})`,
      generatedByAI: true,
    });

    this.logger.log(`Contrato AI criado: ${number}`);
    return contract;
  }

  // =========================================================================
  // HISTÓRICO
  // =========================================================================

  private async recordEvent(
    contractId: string,
    userId: string | null,
    kind: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.contractEvent.create({
        data: {
          contractId,
          userId: userId ?? null,
          kind,
          description: (metadata.description as string) ?? null,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        `Falha ao registrar evento ${kind}: ${(err as Error).message}`,
      );
    }
  }

  async getHistory(teamId: string, id: string) {
    await this.findById(teamId, id);
    const events = await this.prisma.contractEvent.findMany({
      where: { contractId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return { events };
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
