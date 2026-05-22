import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreatePayableDto,
  CreateRevenueDto,
  ListFinanceQueryDto,
  UpdatePayableDto,
  UpdateReceivableDto,
  UpdateRevenueDto,
} from './finance.dto';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // DASHBOARD SUMMARY
  // =========================================================================

  async getSummary(teamId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Aggregations paralelas
    const [
      totalRevenue,
      totalReceivable,
      totalPaid,
      totalOverdue,
      totalPayable,
      totalPayablePaid,
      monthlyRevenue,
      recentReceivables,
      recentPayables,
      last6Months,
    ] = await Promise.all([
      // Total de receita (todos os tempos)
      this.prisma.revenue.aggregate({
        where: { teamId },
        _sum: { amount: true },
      }),
      // Total a receber (pendente)
      this.prisma.accountsReceivable.aggregate({
        where: { teamId, status: 'PENDING' },
        _sum: { amount: true },
      }),
      // Total já recebido
      this.prisma.accountsReceivable.aggregate({
        where: { teamId, status: 'PAID' },
        _sum: { amount: true },
      }),
      // Total em atraso
      this.prisma.accountsReceivable.aggregate({
        where: { teamId, status: 'OVERDUE' },
        _sum: { amount: true },
      }),
      // Total a pagar (pendente)
      this.prisma.accountsPayable.aggregate({
        where: { teamId, status: 'PENDING' },
        _sum: { amount: true },
      }),
      // Total já pago (despesas)
      this.prisma.accountsPayable.aggregate({
        where: { teamId, status: 'PAID' },
        _sum: { amount: true },
      }),
      // Receita do mês atual
      this.prisma.revenue.aggregate({
        where: {
          teamId,
          closedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      }),
      // 5 últimas contas a receber
      this.prisma.accountsReceivable.findMany({
        where: { teamId },
        orderBy: { dueDate: 'asc' },
        take: 5,
        include: { revenue: { select: { description: true, lead: { select: { name: true } } } } },
      }),
      // 5 últimas contas a pagar
      this.prisma.accountsPayable.findMany({
        where: { teamId },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      // Receita mensal dos últimos 6 meses (pra gráfico)
      this.getMonthlyRevenue(teamId, 6),
    ]);

    return {
      totalRevenue: totalRevenue._sum.amount ?? 0,
      totalReceivablePending: totalReceivable._sum.amount ?? 0,
      totalReceived: totalPaid._sum.amount ?? 0,
      totalOverdue: totalOverdue._sum.amount ?? 0,
      totalPayablePending: totalPayable._sum.amount ?? 0,
      totalPayablePaid: totalPayablePaid._sum.amount ?? 0,
      monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
      balance:
        (totalPaid._sum.amount ?? 0) - (totalPayablePaid._sum.amount ?? 0),
      recentReceivables,
      recentPayables,
      monthlyChart: last6Months,
    };
  }

  private async getMonthlyRevenue(teamId: string, months: number) {
    const result: Array<{ month: string; revenue: number; expenses: number }> = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const [rev, exp] = await Promise.all([
        this.prisma.accountsReceivable.aggregate({
          where: { teamId, status: 'PAID', paidAt: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        this.prisma.accountsPayable.aggregate({
          where: { teamId, status: 'PAID', paidAt: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
      ]);

      result.push({
        month: label,
        revenue: rev._sum.amount ?? 0,
        expenses: exp._sum.amount ?? 0,
      });
    }

    return result;
  }

  // =========================================================================
  // REVENUES
  // =========================================================================

  async createRevenue(teamId: string, dto: CreateRevenueDto) {
    const revenue = await this.prisma.revenue.create({
      data: {
        teamId,
        description: dto.description,
        amount: dto.amount,
        proposalId: dto.proposalId,
        leadId: dto.leadId,
        planTier: dto.planTier,
        closedAt: dto.closedAt ? new Date(dto.closedAt) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
        status: 'PENDING',
      },
    });

    // Gera parcelas
    const installments = dto.installments ?? 1;
    const installmentAmount = Math.round((dto.amount / installments) * 100) / 100;
    const baseDate = dto.dueDate ? new Date(dto.dueDate) : new Date();

    for (let i = 0; i < installments; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      await this.prisma.accountsReceivable.create({
        data: {
          teamId,
          revenueId: revenue.id,
          description:
            installments === 1
              ? revenue.description
              : `${revenue.description} — Parcela ${i + 1}/${installments}`,
          amount: installmentAmount,
          installment: i + 1,
          totalInstallments: installments,
          dueDate,
          status: 'PENDING',
        },
      });
    }

    this.logger.log(
      `Revenue criada: R$ ${dto.amount} — ${installments} parcela(s) (team=${teamId})`,
    );

    return revenue;
  }

  async listRevenues(teamId: string, q: ListFinanceQueryDto) {
    const page = q.page ?? 1;
    const perPage = q.perPage ?? 25;
    const where: Prisma.RevenueWhereInput = {
      teamId,
      ...(q.status && { status: q.status }),
      ...(q.from && { closedAt: { gte: new Date(q.from) } }),
      ...(q.to && { closedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), lte: new Date(q.to) } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.revenue.findMany({
        where,
        orderBy: { closedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          lead: { select: { id: true, name: true } },
          proposal: { select: { id: true, title: true } },
          _count: { select: { receivables: true } },
        },
      }),
      this.prisma.revenue.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async updateRevenue(teamId: string, id: string, dto: UpdateRevenueDto) {
    const existing = await this.prisma.revenue.findFirst({
      where: { id, teamId },
    });
    if (!existing) throw new NotFoundException('Receita não encontrada');

    return this.prisma.revenue.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.paidAt !== undefined && { paidAt: new Date(dto.paidAt) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async deleteRevenue(teamId: string, id: string) {
    const existing = await this.prisma.revenue.findFirst({ where: { id, teamId } });
    if (!existing) throw new NotFoundException('Receita não encontrada');
    await this.prisma.revenue.delete({ where: { id } });
  }

  // =========================================================================
  // ACCOUNTS RECEIVABLE
  // =========================================================================

  async listReceivables(teamId: string, q: ListFinanceQueryDto) {
    const page = q.page ?? 1;
    const perPage = q.perPage ?? 25;
    const where: Prisma.AccountsReceivableWhereInput = {
      teamId,
      ...(q.status && { status: q.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.accountsReceivable.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          revenue: {
            select: {
              description: true,
              lead: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.accountsReceivable.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async markReceivablePaid(teamId: string, id: string, dto: UpdateReceivableDto) {
    const existing = await this.prisma.accountsReceivable.findFirst({
      where: { id, teamId },
    });
    if (!existing) throw new NotFoundException('Parcela não encontrada');

    const updated = await this.prisma.accountsReceivable.update({
      where: { id },
      data: {
        status: dto.status ?? 'PAID',
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
      },
    });

    // Verifica se todas as parcelas da receita foram pagas
    await this.checkRevenueFullyPaid(existing.revenueId);

    return updated;
  }

  private async checkRevenueFullyPaid(revenueId: string) {
    const pending = await this.prisma.accountsReceivable.count({
      where: { revenueId, status: { not: 'PAID' } },
    });
    if (pending === 0) {
      await this.prisma.revenue.update({
        where: { id: revenueId },
        data: { status: 'PAID', paidAt: new Date() },
      });
    }
  }

  // =========================================================================
  // ACCOUNTS PAYABLE
  // =========================================================================

  async createPayable(teamId: string, dto: CreatePayableDto) {
    return this.prisma.accountsPayable.create({
      data: {
        teamId,
        description: dto.description,
        amount: dto.amount,
        category: dto.category,
        dueDate: new Date(dto.dueDate),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        status: 'PENDING',
      },
    });
  }

  async listPayables(teamId: string, q: ListFinanceQueryDto) {
    const page = q.page ?? 1;
    const perPage = q.perPage ?? 25;
    const where: Prisma.AccountsPayableWhereInput = {
      teamId,
      ...(q.status && { status: q.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.accountsPayable.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.accountsPayable.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async updatePayable(teamId: string, id: string, dto: UpdatePayableDto) {
    const existing = await this.prisma.accountsPayable.findFirst({
      where: { id, teamId },
    });
    if (!existing) throw new NotFoundException('Conta não encontrada');

    return this.prisma.accountsPayable.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.paidAt !== undefined && { paidAt: new Date(dto.paidAt) }),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async deletePayable(teamId: string, id: string) {
    const existing = await this.prisma.accountsPayable.findFirst({ where: { id, teamId } });
    if (!existing) throw new NotFoundException('Conta não encontrada');
    await this.prisma.accountsPayable.delete({ where: { id } });
  }

  // =========================================================================
  // AUTO: criar revenue quando proposta é aprovada
  // =========================================================================

  /**
   * Chamado pelo ProposalService quando proposta muda pra APPROVED.
   * Cria Revenue + parcelas automaticamente.
   */
  async createFromApprovedProposal(proposal: {
    id: string;
    teamId: string;
    title: string;
    leadId: string;
    plans: unknown;
    paymentConditions: unknown;
    metadata: unknown;
  }) {
    // Prioridade: metadata.approvedPlan (selecionado pelo usuário no modal)
    // Fallback: plano highlighted ou mais caro
    const meta = (proposal.metadata as Record<string, unknown>) ?? {};
    const approvedPlan = meta.approvedPlan as { tier: string; name: string; price: number } | undefined;

    let selectedPlan: { tier?: string; name?: string; price: number } | undefined;

    if (approvedPlan?.price) {
      selectedPlan = approvedPlan;
    } else {
      const plans = Array.isArray(proposal.plans) ? proposal.plans : [];
      selectedPlan =
        plans.find((p: any) => p.highlighted) ??
        plans.sort((a: any, b: any) => (b.price ?? 0) - (a.price ?? 0))[0];
    }

    if (!selectedPlan?.price) {
      this.logger.warn(
        `Proposta ${proposal.id} aprovada mas sem plano com preço — revenue não criada`,
      );
      return null;
    }

    const payment = proposal.paymentConditions as { terms?: string } | null;
    // Tenta extrair número de parcelas do terms (ex: "3x sem juros")
    let installments = 1;
    if (payment?.terms) {
      const match = payment.terms.match(/(\d+)\s*x/i);
      if (match) installments = Math.min(parseInt(match[1], 10), 24);
    }

    return this.createRevenue(proposal.teamId, {
      description: `${proposal.title} — ${selectedPlan.name ?? selectedPlan.tier}`,
      amount: selectedPlan.price,
      proposalId: proposal.id,
      leadId: proposal.leadId,
      planTier: selectedPlan.tier,
      closedAt: new Date().toISOString(),
      installments,
    });
  }

  // =========================================================================
  // CANCELAMENTO de receita ao desfazer aprovação de proposta
  // =========================================================================

  /**
   * Cancela todas as receitas criadas automaticamente pela proposta.
   * Marca Revenue + AccountsReceivable como CANCELLED.
   *
   * Não DELETA pra preservar histórico financeiro (auditoria).
   * Parcelas que já foram pagas (PAID) NÃO são afetadas — só pendentes.
   *
   * Chamado pelo ProposalService quando reverte APROVADA → ENVIADA.
   */
  async cancelRevenueByProposal(teamId: string, proposalId: string) {
    const revenues = await this.prisma.revenue.findMany({
      where: { teamId, proposalId },
      select: { id: true, status: true },
    });

    if (revenues.length === 0) {
      this.logger.log(
        `Nenhuma receita encontrada pra proposta ${proposalId} — nada a cancelar`,
      );
      return { cancelled: 0 };
    }

    let cancelled = 0;
    for (const rev of revenues) {
      // Cancela só receitas que ainda não foram pagas integralmente
      if (rev.status === 'PAID') {
        this.logger.warn(
          `Revenue ${rev.id} já está paga — pulando cancelamento`,
        );
        continue;
      }

      // Cancela parcelas pendentes (não mexe nas pagas)
      await this.prisma.accountsReceivable.updateMany({
        where: {
          revenueId: rev.id,
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        data: { status: 'CANCELLED' },
      });

      // Marca a receita como cancelada
      await this.prisma.revenue.update({
        where: { id: rev.id },
        data: { status: 'CANCELLED' },
      });

      cancelled++;
    }

    this.logger.log(
      `Receitas canceladas pra proposta ${proposalId}: ${cancelled}`,
    );
    return { cancelled };
  }

  // =========================================================================
  // EXPORT — CSV e PDF (HTML pra Puppeteer renderizar)
  // =========================================================================

  /**
   * Gera CSV de todas as movimentações financeiras do team.
   * Encoding UTF-8 com BOM pra Excel reconhecer acentos automaticamente.
   */
  async exportToCsv(teamId: string): Promise<string> {
    const [revenues, receivables, payables] = await Promise.all([
      this.prisma.revenue.findMany({
        where: { teamId },
        orderBy: { closedAt: 'desc' },
        include: { lead: { select: { name: true } } },
      }),
      this.prisma.accountsReceivable.findMany({
        where: { teamId },
        orderBy: { dueDate: 'asc' },
        include: { revenue: { include: { lead: { select: { name: true } } } } },
      }),
      this.prisma.accountsPayable.findMany({
        where: { teamId },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const rows: string[] = [];
    // BOM UTF-8 + magic header "sep=;" pro Excel reconhecer separador
    // independente de localidade (Excel usa "," em US, ";" em pt-BR, etc).
    // Esse header é uma instrução proprietária do Excel — funciona sem afetar
    // outros leitores (LibreOffice, Google Sheets também respeitam).
    rows.push('\ufeffsep=;');
    rows.push('Tipo;Descrição;Cliente/Categoria;Valor (R$);Status;Vencimento;Pagamento;Notas');

    const fmtDate = (d: Date | string | null) =>
      d ? new Date(d).toLocaleDateString('pt-BR') : '';
    const fmtMoney = (n: number) =>
      n.toFixed(2).replace('.', ',');
    const escapeCsv = (s: string | null | undefined) => {
      if (!s) return '';
      // Escapa ; e quebras de linha
      return s.replace(/;/g, ',').replace(/[\r\n]+/g, ' ');
    };

    // Receitas
    for (const r of revenues) {
      rows.push([
        'RECEITA',
        escapeCsv(r.description),
        escapeCsv(r.lead?.name ?? '—'),
        fmtMoney(r.amount),
        r.status,
        fmtDate(r.closedAt),
        fmtDate(r.paidAt),
        escapeCsv(r.notes),
      ].join(';'));
    }

    // Contas a receber
    for (const c of receivables) {
      rows.push([
        'A RECEBER',
        escapeCsv(c.description),
        escapeCsv(c.revenue?.lead?.name ?? '—'),
        fmtMoney(c.amount),
        c.status,
        fmtDate(c.dueDate),
        fmtDate(c.paidAt),
        escapeCsv(c.notes),
      ].join(';'));
    }

    // Contas a pagar
    for (const p of payables) {
      rows.push([
        'A PAGAR',
        escapeCsv(p.description),
        escapeCsv(p.category ?? '—'),
        fmtMoney(p.amount),
        p.status,
        fmtDate(p.dueDate),
        fmtDate(p.paidAt),
        escapeCsv(p.notes),
      ].join(';'));
    }

    return rows.join('\r\n');
  }

  /**
   * Gera HTML pronto pra Puppeteer renderizar como PDF.
   * Layout limpo, profissional, com totais.
   */
  async exportToHtml(teamId: string): Promise<string> {
    const summary = await this.getSummary(teamId);
    const [revenues, receivables, payables] = await Promise.all([
      this.prisma.revenue.findMany({
        where: { teamId },
        orderBy: { closedAt: 'desc' },
        take: 100,
        include: { lead: { select: { name: true } } },
      }),
      this.prisma.accountsReceivable.findMany({
        where: { teamId },
        orderBy: { dueDate: 'asc' },
        take: 100,
        include: { revenue: { include: { lead: { select: { name: true } } } } },
      }),
      this.prisma.accountsPayable.findMany({
        where: { teamId },
        orderBy: { dueDate: 'asc' },
        take: 100,
      }),
    ]);

    const fmtMoney = (n: number) =>
      n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = (d: Date | string | null) =>
      d ? new Date(d).toLocaleDateString('pt-BR') : '—';

    const statusLabel: Record<string, { label: string; color: string }> = {
      PENDING: { label: 'Pendente', color: '#f59e0b' },
      PAID: { label: 'Pago', color: '#10b981' },
      OVERDUE: { label: 'Atrasado', color: '#ef4444' },
      CANCELLED: { label: 'Cancelado', color: '#6b7280' },
    };

    const today = new Date().toLocaleDateString('pt-BR');

    const renderRow = (
      desc: string,
      ref: string,
      amount: number,
      status: string,
      date: string,
    ) => `
      <tr>
        <td>${desc}</td>
        <td>${ref}</td>
        <td style="text-align:right; font-weight:700;">${fmtMoney(amount)}</td>
        <td><span style="color:${statusLabel[status]?.color ?? '#000'}; font-weight:600; font-size:11px;">${statusLabel[status]?.label ?? status}</span></td>
        <td>${date}</td>
      </tr>
    `;

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Financeiro</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    padding: 32px;
    font-size: 12px;
  }
  h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
  h2 { font-size: 14px; font-weight: 700; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #00ff88; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  .meta { font-size: 11px; color: #64748b; text-align: right; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .card { padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
  .card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.06em; }
  .card-value { font-size: 18px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .card-value.green { color: #10b981; }
  .card-value.red { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:hover { background: #fafbfc; }
  .empty { padding: 24px; text-align: center; color: #94a3b8; font-style: italic; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório Financeiro</h1>
      <p style="font-size:12px; color:#64748b; margin-top:4px;">Visão consolidada de receitas, contas a receber e contas a pagar</p>
    </div>
    <div class="meta">
      <p>Gerado em ${today}</p>
      <p style="margin-top:2px;">Prospect — Sistema de prospecção B2B</p>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="card-label">Receita total</div>
      <div class="card-value green">${fmtMoney(summary.totalRevenue)}</div>
    </div>
    <div class="card">
      <div class="card-label">A receber</div>
      <div class="card-value">${fmtMoney(summary.totalReceivablePending)}</div>
    </div>
    <div class="card">
      <div class="card-label">A pagar</div>
      <div class="card-value red">${fmtMoney(summary.totalPayablePending)}</div>
    </div>
    <div class="card">
      <div class="card-label">Saldo</div>
      <div class="card-value ${summary.balance >= 0 ? 'green' : 'red'}">${fmtMoney(summary.balance)}</div>
    </div>
  </div>

  <h2>Receitas (${revenues.length})</h2>
  ${revenues.length === 0 ? '<div class="empty">Nenhuma receita registrada</div>' : `
  <table>
    <thead>
      <tr><th>Descrição</th><th>Cliente</th><th style="text-align:right;">Valor</th><th>Status</th><th>Fechamento</th></tr>
    </thead>
    <tbody>
      ${revenues.map((r) => renderRow(r.description, r.lead?.name ?? '—', r.amount, r.status, fmtDate(r.closedAt))).join('')}
    </tbody>
  </table>`}

  <h2>Contas a receber (${receivables.length})</h2>
  ${receivables.length === 0 ? '<div class="empty">Nenhuma parcela a receber</div>' : `
  <table>
    <thead>
      <tr><th>Descrição</th><th>Cliente</th><th style="text-align:right;">Valor</th><th>Status</th><th>Vencimento</th></tr>
    </thead>
    <tbody>
      ${receivables.map((r) => renderRow(r.description, r.revenue?.lead?.name ?? '—', r.amount, r.status, fmtDate(r.dueDate))).join('')}
    </tbody>
  </table>`}

  <h2>Contas a pagar (${payables.length})</h2>
  ${payables.length === 0 ? '<div class="empty">Nenhuma despesa registrada</div>' : `
  <table>
    <thead>
      <tr><th>Descrição</th><th>Categoria</th><th style="text-align:right;">Valor</th><th>Status</th><th>Vencimento</th></tr>
    </thead>
    <tbody>
      ${payables.map((p) => renderRow(p.description, p.category ?? '—', p.amount, p.status, fmtDate(p.dueDate))).join('')}
    </tbody>
  </table>`}

  <div class="footer">
    Relatório gerado automaticamente pelo Prospect · ${today}
  </div>
</body>
</html>`;
  }
}
