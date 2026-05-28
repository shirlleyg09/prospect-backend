/**
 * @file google-places.provider.ts
 * @description Provider Google Places API — produção-ready.
 *
 * Arquitetura em 2 fases:
 *   1. TEXT SEARCH → retorna lista de `place_id` + dados básicos (nome, endereço, rating)
 *   2. PLACE DETAILS (por place_id) → enriquece com telefone, site, horários
 *
 * A fase 2 roda em paralelo com concorrência limitada pra respeitar o rate limit
 * do Google (1000 req/min por API no plano padrão, mas best practice é 10 concurrent).
 *
 * Paginação: o Text Search retorna até 20 por página + `next_page_token`.
 * Cada token só funciona depois de ~2s (documentado pelo Google). Esperamos.
 *
 * Erros tipados:
 *   - INVALID_KEY     → key revogada/malformada
 *   - OVER_QUERY_LIMIT → quota ou billing pausado
 *   - REQUEST_DENIED  → API não habilitada no projeto
 *   - NETWORK         → falha de rede
 *   - UNKNOWN
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  LeadProvider,
  NormalizedLead,
  ProviderKind,
  RawLead,
  SearchParams,
} from '../interfaces/lead-provider.interface';

interface GooglePlacesOptions {
  name: string;
  apiKey: string;
  /** Máximo de páginas de text search (cada página = ~20 resultados). Default 3 = 60 leads. */
  maxPages?: number;
  /** Se `true`, faz 2ª chamada para /details/json em cada lead (enriquece telefone/site). Default true. */
  fetchDetails?: boolean;
  /** Concorrência máxima nas chamadas /details. Default 10. */
  detailsConcurrency?: number;
}

interface GooglePlacesResponse<T> {
  status:
    | 'OK'
    | 'ZERO_RESULTS'
    | 'INVALID_REQUEST'
    | 'OVER_QUERY_LIMIT'
    | 'REQUEST_DENIED'
    | 'UNKNOWN_ERROR'
    | 'NOT_FOUND';
  error_message?: string;
  results?: T[];
  result?: T;
  next_page_token?: string;
}

interface GoogleTextSearchResult {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  price_level?: number;
  photos?: unknown[];
}

interface GooglePlaceDetailsResult extends GoogleTextSearchResult {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string; // URL do Google Maps para o lugar
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
}

export class GooglePlacesError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_KEY'
      | 'OVER_QUERY_LIMIT'
      | 'REQUEST_DENIED'
      | 'NETWORK'
      | 'UNKNOWN',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

@Injectable()
export class GooglePlacesProvider implements LeadProvider {
  public readonly kind: ProviderKind = 'google-places';
  public readonly name: string;

  private readonly logger = new Logger(GooglePlacesProvider.name);
  private readonly http: AxiosInstance;
  private readonly maxPages: number;
  private readonly fetchDetails: boolean;
  private readonly detailsConcurrency: number;
  private readonly apiKey: string;

  /**
   * Cache do healthcheck — evita chamar a API a cada busca.
   * TTL: 10 minutos. Cada chamada ao isAvailable() dentro da janela
   * reutiliza o resultado sem fazer nenhuma requisição HTTP.
   */
  private healthCache: { ok: boolean; expiresAt: number } | null = null;
  private readonly HEALTH_TTL_MS = 10 * 60_000;

  constructor(opts: GooglePlacesOptions) {
    this.name = opts.name;
    this.apiKey = opts.apiKey;
    this.maxPages = opts.maxPages ?? 3;
    this.fetchDetails = opts.fetchDetails ?? true;
    this.detailsConcurrency = opts.detailsConcurrency ?? 10;
    this.http = axios.create({
      baseURL: 'https://maps.googleapis.com/maps/api/place',
      timeout: 30_000,
    });
  }

  /**
   * Valida a key com cache de 10 minutos.
   * Sem cache: usa findplacefromtext com fields=place_id (SKU "IDs only",
   * $5/1000 vs $32/1000 do Text Search anterior) — 6× mais barato.
   * Com cache ativo: zero requisições HTTP.
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.healthCache && now < this.healthCache.expiresAt) {
      return this.healthCache.ok;
    }
    try {
      await this.pingKey();
      this.healthCache = { ok: true, expiresAt: now + this.HEALTH_TTL_MS };
      return true;
    } catch (err) {
      this.healthCache = { ok: false, expiresAt: now + this.HEALTH_TTL_MS };
      this.logger.warn(`Google Places indisponível: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Healthcheck público — chamado explicitamente pelo botão "Testar conexão".
   * Invalida o cache para forçar verificação fresca.
   * Usa findplacefromtext (SKU IDs only, $5/1000) em vez de textsearch ($32/1000).
   */
  async fetchAccountCheck(): Promise<{ ok: true; message: string }> {
    this.healthCache = null; // força re-check na próxima busca também
    try {
      await this.pingKey();
      return { ok: true, message: 'Key válida e billing ativo' };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  /**
   * Chamada mínima para validar a key.
   * findplacefromtext + fields=place_id = SKU "IDs only" = $5/1000.
   * Retorna OK, ZERO_RESULTS ou INVALID_REQUEST para keys válidas.
   * Retorna REQUEST_DENIED apenas para keys inválidas/sem permissão.
   */
  private async pingKey(): Promise<void> {
    try {
      const { data } = await this.http.get<GooglePlacesResponse<unknown>>(
        '/findplacefromtext/json',
        {
          params: {
            input: 'a',
            inputtype: 'textquery',
            fields: 'place_id',
            key: this.apiKey,
          },
        },
      );
      // OK, ZERO_RESULTS e INVALID_REQUEST indicam key válida (errou na query, não na auth)
      if (
        data.status === 'REQUEST_DENIED' ||
        data.status === 'UNKNOWN_ERROR'
      ) {
        this.checkStatus(data);
      }
    } catch (err) {
      throw this.translateError(err);
    }
  }

  /**
   * Busca principal em 2 fases.
   */
  async search(params: SearchParams): Promise<RawLead[]> {
    const limit = params.limit ?? 60;
    const query = this.buildQuery(params);

    // FASE 1 — Text Search com paginação
    const textResults = await this.paginatedTextSearch(query, params.locale, limit);

    // FASE 2 — Place Details em paralelo (opcional mas default=true)
    let enriched: GooglePlaceDetailsResult[];
    if (this.fetchDetails) {
      enriched = await this.enrichWithDetails(textResults, params.locale);
    } else {
      enriched = textResults as GooglePlaceDetailsResult[];
    }

    this.logger.log(
      `GooglePlaces "${query}": ${textResults.length} encontrados, ${enriched.length} enriquecidos`,
    );

    return enriched
      .filter((r) => r.place_id) // descarta itens sem ID (raros)
      .map((r) => ({
        sourceKind: this.kind,
        sourceId: r.place_id!,
        raw: r as unknown as Record<string, unknown>,
      }));
  }

  /**
   * Normalização — extrai cidade/estado via address_components (mais confiável que parse regex).
   */
  normalize(raws: RawLead[]): NormalizedLead[] {
    return raws.map((r) => {
      const d = r.raw as unknown as GooglePlaceDetailsResult;
      const components = parseAddressComponents(d.address_components);

      return {
        sourceKind: this.kind,
        sourceId: r.sourceId,
        name: d.name?.trim() ?? 'Sem nome',
        phone: normalizePhone(d.international_phone_number ?? d.formatted_phone_number),
        whatsapp: undefined,
        website: normalizeUrl(d.website),
        instagram: extractInstagramFromUrl(d.website),
        address: d.formatted_address?.trim(),
        city: components.city,
        state: components.state,
        country: components.country ?? 'BR',
        latitude: d.geometry?.location?.lat,
        longitude: d.geometry?.location?.lng,
        niche: inferNiche(d.types),
        googleRating: typeof d.rating === 'number' ? d.rating : undefined,
        googleReviews: typeof d.user_ratings_total === 'number' ? d.user_ratings_total : undefined,
        extra: {
          businessStatus: d.business_status,
          priceLevel: d.price_level,
          types: d.types,
          openingHours: d.opening_hours?.weekday_text,
          mapsUrl: d.url,
        },
      };
    });
  }

  // -------------------------------------------------------------------------
  // Privados — Text Search paginado
  // -------------------------------------------------------------------------

  private async paginatedTextSearch(
    query: string,
    locale?: string,
    limit = 60,
  ): Promise<GoogleTextSearchResult[]> {
    const collected: GoogleTextSearchResult[] = [];
    let nextPageToken: string | undefined;

    for (let page = 0; page < this.maxPages; page++) {
      if (collected.length >= limit) break;

      // Google exige delay mínimo ~2s antes de usar next_page_token
      if (page > 0 && nextPageToken) {
        await sleep(2_100);
      }

      const { data } = await this.http
        .get<GooglePlacesResponse<GoogleTextSearchResult>>('/textsearch/json', {
          params: {
            query,
            language: locale ?? 'pt-BR',
            region: 'br',
            key: this.apiKey,
            ...(nextPageToken && { pagetoken: nextPageToken }),
          },
        })
        .catch((err) => {
          throw this.translateError(err);
        });

      this.checkStatus(data);

      const results = data.results ?? [];
      if (results.length === 0) break;

      collected.push(...results);
      nextPageToken = data.next_page_token;

      if (!nextPageToken) break; // sem mais páginas
    }

    return collected.slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Privados — Place Details com concorrência limitada
  // -------------------------------------------------------------------------

  private async enrichWithDetails(
    items: GoogleTextSearchResult[],
    locale?: string,
  ): Promise<GooglePlaceDetailsResult[]> {
    const result: GooglePlaceDetailsResult[] = new Array(items.length);
    let cursor = 0;

    // Pool de N workers paralelos puxando do cursor compartilhado
    const workers = Array.from({ length: this.detailsConcurrency }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        const item = items[i];
        if (!item.place_id) {
          result[i] = item as GooglePlaceDetailsResult;
          continue;
        }
        try {
          const details = await this.fetchPlaceDetails(item.place_id, locale);
          // Merge: details têm prioridade, mas preservamos campos da busca
          result[i] = { ...item, ...details };
        } catch (err) {
          // Se o details falhar, seguimos com os dados básicos do text search
          this.logger.warn(`Details falhou para ${item.place_id}: ${(err as Error).message}`);
          result[i] = item as GooglePlaceDetailsResult;
        }
      }
    });

    await Promise.all(workers);
    return result;
  }

  private async fetchPlaceDetails(
    placeId: string,
    locale?: string,
  ): Promise<GooglePlaceDetailsResult> {
    const { data } = await this.http.get<GooglePlacesResponse<GooglePlaceDetailsResult>>(
      '/details/json',
      {
        params: {
          place_id: placeId,
          language: locale ?? 'pt-BR',
          // Campos específicos pra reduzir custo — Google cobra por campo retornado
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'address_components',
            'geometry',
            'international_phone_number',
            'formatted_phone_number',
            'website',
            'url',
            'rating',
            'user_ratings_total',
            'types',
            'business_status',
            'price_level',
            'opening_hours',
          ].join(','),
          key: this.apiKey,
        },
      },
    );

    this.checkStatus(data);
    if (!data.result) {
      throw new GooglePlacesError('UNKNOWN', `Details sem result para ${placeId}`);
    }
    return data.result;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildQuery(params: SearchParams): string {
    return `${params.niche.trim()} em ${params.location.trim()}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Google Places sempre retorna 200 HTTP — o erro real está em `status`.
   * Mapeamos pra erros tipados.
   */
  private checkStatus(data: GooglePlacesResponse<unknown>): void {
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') return;

    const msg = data.error_message ?? `Google Places retornou status=${data.status}`;

    switch (data.status) {
      case 'REQUEST_DENIED':
        // Normalmente: Places API não habilitada no projeto, ou key sem permissão
        throw new GooglePlacesError(
          data.error_message?.toLowerCase().includes('api key')
            ? 'INVALID_KEY'
            : 'REQUEST_DENIED',
          msg,
        );
      case 'OVER_QUERY_LIMIT':
        throw new GooglePlacesError('OVER_QUERY_LIMIT', msg);
      case 'INVALID_REQUEST':
        throw new GooglePlacesError('UNKNOWN', `Request inválida: ${msg}`);
      default:
        throw new GooglePlacesError('UNKNOWN', msg);
    }
  }

  private translateError(err: unknown): GooglePlacesError {
    if (err instanceof GooglePlacesError) return err;
    if (err instanceof AxiosError) {
      if (!err.response) {
        return new GooglePlacesError('NETWORK', `Falha de rede: ${err.message}`, err);
      }
      return new GooglePlacesError('UNKNOWN', `HTTP ${err.response.status}: ${err.message}`, err);
    }
    return new GooglePlacesError('UNKNOWN', (err as Error)?.message ?? 'Erro desconhecido', err);
  }
}

// ===========================================================================
// Helpers de normalização — exportados para testes unitários
// ===========================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Extrai city/state/country de address_components — muito mais confiável
 * que parsear a string formatted_address.
 */
export function parseAddressComponents(
  components?: Array<{ long_name: string; short_name: string; types: string[] }>,
): { city?: string; state?: string; country?: string } {
  if (!components) return {};

  const pickBy = (type: string, useShort = false) => {
    const c = components.find((x) => x.types.includes(type));
    return c ? (useShort ? c.short_name : c.long_name) : undefined;
  };

  return {
    // Brasil: cidade em administrative_area_level_2, com fallback para locality
    city: pickBy('administrative_area_level_2') ?? pickBy('locality'),
    // UF em administrative_area_level_1 (pegamos o código curto: SP, PE, RJ)
    state: pickBy('administrative_area_level_1', true),
    country: pickBy('country', true),
  };
}

export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.length >= 8 ? cleaned : undefined;
}

export function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function extractInstagramFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Mapeia types do Google Places pra nichos em pt-BR. Usa o type mais específico.
 */
export function inferNiche(types?: string[]): string | undefined {
  if (!types?.length) return undefined;

  const map: Record<string, string> = {
    dentist: 'Clínica Odontológica',
    doctor: 'Clínica Médica',
    physiotherapist: 'Fisioterapia',
    veterinary_care: 'Clínica Veterinária',
    hair_salon: 'Salão de Beleza',
    beauty_salon: 'Salão de Beleza',
    barber_shop: 'Barbearia',
    spa: 'Spa',
    gym: 'Academia',
    restaurant: 'Restaurante',
    cafe: 'Cafeteria',
    bakery: 'Padaria',
    bar: 'Bar',
    night_club: 'Casa Noturna',
    pharmacy: 'Farmácia',
    pet_store: 'Pet Shop',
    real_estate_agency: 'Imobiliária',
    lawyer: 'Advocacia',
    accounting: 'Contabilidade',
    school: 'Escola',
    book_store: 'Livraria',
    clothing_store: 'Loja de Roupas',
    shoe_store: 'Loja de Calçados',
    jewelry_store: 'Joalheria',
    furniture_store: 'Loja de Móveis',
    home_goods_store: 'Casa e Decoração',
    electronics_store: 'Eletrônicos',
    car_dealer: 'Concessionária',
    car_repair: 'Oficina Mecânica',
    car_wash: 'Lava Rápido',
    gas_station: 'Posto de Combustível',
    store: 'Comércio',
    storage: 'Armazenamento',
    lodging: 'Hospedagem',
    travel_agency: 'Agência de Viagens',
  };

  // Pega o primeiro type que a gente mapeia — Google retorna do mais específico ao mais genérico
  for (const t of types) {
    if (map[t]) return map[t];
  }

  // Fallback: capitaliza o primeiro type
  return types[0]
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
