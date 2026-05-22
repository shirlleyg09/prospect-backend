/**
 * @file apify.provider.ts
 * @description
 *   Implementação do `LeadProvider` para Apify. Usa um Actor configurável
 *   por ProviderConfig (ex: Google Maps Scraper, Instagram Scraper).
 *
 *   Importante: este arquivo só sabe sobre Apify. O domínio (LeadService,
 *   SearchOrchestrator) NUNCA o referencia diretamente; sempre via
 *   `ProviderRegistry` ou injeção via token.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ApifyClient } from 'apify-client';
import {
  LeadProvider,
  NormalizedLead,
  ProviderKind,
  RawLead,
  SearchParams,
} from '../interfaces/lead-provider.interface';

interface ApifyProviderOptions {
  name: string;
  apiToken: string;
  actorId: string;
  /** tempo máximo de espera por execução em ms */
  timeoutMs?: number;
  /** mapper de SearchParams → input do actor */
  buildInput?: (params: SearchParams) => Record<string, unknown>;
}

@Injectable()
export class ApifyProvider implements LeadProvider {
  public readonly kind: ProviderKind = 'apify';
  public readonly name: string;

  private readonly logger = new Logger(ApifyProvider.name);
  private readonly client: ApifyClient;
  private readonly actorId: string;
  private readonly timeoutMs: number;
  private readonly buildInput: (params: SearchParams) => Record<string, unknown>;

  constructor(options: ApifyProviderOptions) {
    this.name = options.name;
    this.client = new ApifyClient({ token: options.apiToken });
    this.actorId = options.actorId;
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    this.buildInput = options.buildInput ?? this.defaultBuildInput;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.user().get();
      return true;
    } catch (err) {
      this.logger.warn(`Apify "${this.name}" indisponível: ${(err as Error).message}`);
      return false;
    }
  }

  async search(params: SearchParams): Promise<RawLead[]> {
    const input = this.buildInput(params);

    this.logger.log(`Executando Apify actor=${this.actorId} input=${JSON.stringify(input)}`);

    const run = await this.client.actor(this.actorId).call(input, {
      timeout: Math.floor(this.timeoutMs / 1000),
    });

    const { items } = await this.client
      .dataset(run.defaultDatasetId)
      .listItems({ limit: params.limit ?? 500 });

    return items.map((item, idx) => ({
      sourceKind: this.kind,
      sourceId: String((item.placeId as string) ?? (item.id as string) ?? `${run.id}-${idx}`),
      raw: item as Record<string, unknown>,
    }));
  }

  normalize(raws: RawLead[]): NormalizedLead[] {
    return raws.map((r) => {
      const d = r.raw;
      return {
        sourceKind: this.kind,
        sourceId: r.sourceId,
        name: String(d.title ?? d.name ?? 'Sem nome'),
        legalName: d.legalName as string | undefined,
        phone: this.cleanPhone(d.phone ?? d.phoneNumber),
        whatsapp: this.cleanPhone(d.whatsapp),
        email: d.email as string | undefined,
        website: d.website as string | undefined,
        instagram: d.instagram as string | undefined,
        facebook: d.facebook as string | undefined,
        address: d.address as string | undefined,
        city: d.city as string | undefined,
        state: d.state as string | undefined,
        country: (d.countryCode as string) ?? 'BR',
        zipCode: d.postalCode as string | undefined,
        latitude: this.toNumber(d.latitude ?? (d.location as any)?.lat),
        longitude: this.toNumber(d.longitude ?? (d.location as any)?.lng),
        niche: d.category as string | undefined,
        description: d.description as string | undefined,
        googleRating: this.toNumber(d.rating ?? d.totalScore),
        googleReviews: this.toNumber(d.reviewsCount ?? d.reviews),
        extra: { apifyActor: this.actorId },
      };
    });
  }

  // ---------------------------------------------------------------------------

  private defaultBuildInput(params: SearchParams): Record<string, unknown> {
    return {
      searchStringsArray: [`${params.niche} em ${params.location}`],
      maxCrawledPlaces: params.limit ?? 200,
      language: params.locale ?? 'pt-BR',
    };
  }

  private cleanPhone(v: unknown): string | undefined {
    if (!v) return undefined;
    return String(v).replace(/\D+/g, '');
  }

  private toNumber(v: unknown): number | undefined {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
}
