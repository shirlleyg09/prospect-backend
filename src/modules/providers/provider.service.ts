/**
 * @file provider.service.ts
 * @description
 *   Orquestrador central dos providers. Responsabilidades:
 *     - Instanciar providers a partir de ProviderConfig (DB)
 *     - Executar buscas em paralelo
 *     - Aplicar fallback entre providers
 *     - Deduplicar leads (mesmo CNPJ / domínio / telefone)
 *     - Emitir auditoria (ProviderRun)
 *
 *   Nenhum provider concreto é importado diretamente pelos consumidores;
 *   tudo passa por este service.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfig, ProviderKind as DbProviderKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ApifyProvider } from './apify/apify.provider';
import { GooglePlacesProvider } from './google-places/google-places.provider';
import {
  LeadProvider,
  NormalizedLead,
  SearchParams,
} from './interfaces/lead-provider.interface';
import { ProviderConfigService } from './provider-config.service';
import { SerpApiProvider } from './serpapi/serpapi.provider';

export interface OrchestrateOptions {
  teamId: string;
  searchId?: string;
  params: SearchParams;
  /** Nomes específicos de providers a usar. Vazio = todos enabled do team */
  providerNames?: string[];
  /** Se true, falha de um provider não aborta os demais */
  continueOnError?: boolean;
}

export interface OrchestrateResult {
  leads: NormalizedLead[];
  runs: Array<{
    providerName: string;
    kind: string;
    status: 'success' | 'error';
    count: number;
    error?: string;
  }>;
}

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ProviderConfigService,
  ) {}

  /**
   * Ponto de entrada: executa a busca em N providers do team e
   * retorna uma lista única, deduplicada e normalizada.
   */
  async orchestrate(opts: OrchestrateOptions): Promise<OrchestrateResult> {
    const configs = await this.loadConfigs(opts.teamId, opts.providerNames);
    if (configs.length === 0) {
      this.logger.warn(`Nenhum provider ativo para team=${opts.teamId}`);
      return { leads: [], runs: [] };
    }

    // Executa em paralelo com settlement — um falhar não derruba os outros
    const settled = await Promise.allSettled(
      configs.map((cfg) => this.runSingle(cfg, opts)),
    );

    const runs: OrchestrateResult['runs'] = [];
    const allLeads: NormalizedLead[] = [];

    settled.forEach((res, idx) => {
      const cfg = configs[idx];
      if (res.status === 'fulfilled') {
        runs.push({
          providerName: cfg.name,
          kind: cfg.kind,
          status: 'success',
          count: res.value.length,
        });
        allLeads.push(...res.value);
      } else {
        const msg = (res.reason as Error)?.message ?? String(res.reason);
        this.logger.error(`Provider ${cfg.name} falhou: ${msg}`);
        runs.push({
          providerName: cfg.name,
          kind: cfg.kind,
          status: 'error',
          count: 0,
          error: msg,
        });
        if (!opts.continueOnError) {
          // mesmo sem continueOnError, não relançamos —
          // apenas marcamos; fallback é o comportamento padrão.
        }
      }
    });

    const deduped = this.dedupe(allLeads);
    // Aplica limit GLOBAL depois do dedup — cada provider pode ter trazido até o limit
    // individualmente, então sem esse corte o usuário recebe mais do que pediu.
    const finalLeads = opts.params.limit
      ? deduped.slice(0, opts.params.limit)
      : deduped;

    this.logger.log(
      `Orquestração team=${opts.teamId}: ${allLeads.length} brutos → ${deduped.length} dedup → ${finalLeads.length} finais (limit=${opts.params.limit ?? 'sem'})`,
    );
    return { leads: finalLeads, runs };
  }

  /**
   * Executa um único provider, registra ProviderRun e retorna leads normalizados.
   */
  private async runSingle(
    cfg: ProviderConfig,
    opts: OrchestrateOptions,
  ): Promise<NormalizedLead[]> {
    const run = await this.prisma.providerRun.create({
      data: {
        providerConfigId: cfg.id,
        searchId: opts.searchId,
        status: 'running',
      },
    });

    try {
      const provider = this.buildProvider(cfg);
      const available = await provider.isAvailable();
      if (!available) throw new Error('provider não disponível (healthcheck falhou)');

      const raw = await provider.search(opts.params);
      const normalized = provider.normalize(raw);

      await this.prisma.providerRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          resultsCount: normalized.length,
        },
      });

      return normalized;
    } catch (err) {
      await this.prisma.providerRun.update({
        where: { id: run.id },
        data: {
          status: 'error',
          finishedAt: new Date(),
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }
  }

  /**
   * Factory: transforma um ProviderConfig em instância concreta de LeadProvider.
   * É AQUI que o acoplamento "nome → classe" mora — em um único lugar.
   *
   * IMPORTANTE: os secrets no DB estão criptografados (AES-256-GCM).
   * Descriptografamos via ProviderConfigService antes de passar para o provider.
   */
  private buildProvider(cfg: ProviderConfig): LeadProvider {
    const secrets = this.configService.decryptSecrets(cfg);
    const config = (cfg.config as Record<string, any>) ?? {};

    switch (cfg.kind) {
      case 'APIFY':
        return new ApifyProvider({
          name: cfg.name,
          apiToken: secrets.apiToken,
          actorId: config.actorId ?? 'compass/crawler-google-places',
        });

      case 'SERPAPI':
        return new SerpApiProvider({
          name: cfg.name,
          apiKey: secrets.apiKey,
          engine: config.engine ?? 'google_maps',
          maxPages: config.maxPages ?? 5,
        });

      case 'GOOGLE_PLACES':
        return new GooglePlacesProvider({
          name: cfg.name,
          apiKey: secrets.apiKey,
          maxPages: typeof config.maxPages === 'number' ? config.maxPages : 3,
          // config.fetchDetails vem como string 'true'/'false' do select do modal
          fetchDetails:
            config.fetchDetails === undefined
              ? true
              : String(config.fetchDetails) === 'true',
        });

      case 'CUSTOM':
        throw new Error(`Custom providers devem ser registrados via plugin system`);

      default:
        throw new Error(`Provider kind desconhecido: ${cfg.kind}`);
    }
  }

  private async loadConfigs(teamId: string, names?: string[]): Promise<ProviderConfig[]> {
    return this.prisma.providerConfig.findMany({
      where: {
        teamId,
        enabled: true,
        ...(names && names.length ? { name: { in: names } } : {}),
      },
      orderBy: { priority: 'asc' },
    });
  }

  /**
   * Dedup por (em ordem de prioridade):
   *   1. CNPJ
   *   2. domínio do website
   *   3. telefone/whatsapp
   *   4. nome + cidade
   *
   * Leads duplicados são mesclados — campos não nulos do primeiro vencem,
   * os demais preenchem lacunas.
   */
  private dedupe(leads: NormalizedLead[]): NormalizedLead[] {
    const byKey = new Map<string, NormalizedLead>();

    for (const lead of leads) {
      const key = this.dedupKey(lead);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, lead);
      } else {
        byKey.set(key, this.merge(existing, lead));
      }
    }

    return Array.from(byKey.values());
  }

  private dedupKey(lead: NormalizedLead): string {
    if (lead.cnpj) return `cnpj:${lead.cnpj.replace(/\D+/g, '')}`;
    if (lead.website) {
      try {
        const host = new URL(
          lead.website.startsWith('http') ? lead.website : `https://${lead.website}`,
        ).host.replace(/^www\./, '');
        return `domain:${host}`;
      } catch {
        /* falha silenciosa, cai para próximo critério */
      }
    }
    if (lead.phone) return `phone:${lead.phone.replace(/\D+/g, '')}`;
    return `name:${lead.name.toLowerCase().trim()}|${lead.city?.toLowerCase() ?? ''}`;
  }

  private merge(a: NormalizedLead, b: NormalizedLead): NormalizedLead {
    return {
      ...b,
      ...a, // "a" (primeiro visto) prevalece
      // mas campos nulos em "a" herdam de "b"
      email: a.email ?? b.email,
      phone: a.phone ?? b.phone,
      website: a.website ?? b.website,
      instagram: a.instagram ?? b.instagram,
      googleRating: a.googleRating ?? b.googleRating,
      googleReviews: a.googleReviews ?? b.googleReviews,
      latitude: a.latitude ?? b.latitude,
      longitude: a.longitude ?? b.longitude,
      extra: { ...(b.extra ?? {}), ...(a.extra ?? {}) },
    };
  }
}
