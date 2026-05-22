/**
 * @file serpapi.provider.ts
 * @description Provider SerpAPI — busca real via Google Maps/Local.
 *
 * Recursos:
 *  - Paginação automática (Google Maps retorna ~20 por página, buscamos até
 *    atingir o `limit` do usuário ou 5 páginas — o que vier primeiro).
 *  - Tratamento de erros específicos (401 key inválida, 402 quota excedida, 429 rate limit).
 *  - Normalização completa: extrai cidade/estado do endereço, limpa telefone,
 *    identifica instagram se aparecer no site, infere nicho.
 *  - `isAvailable` consulta o endpoint /account pra validar key e saldo.
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

interface SerpApiOptions {
  name: string;
  apiKey: string;
  /** Engine do SerpAPI — google_maps funciona melhor para empresas físicas. */
  engine?: 'google_maps' | 'google_local';
  /** Número máximo de páginas por busca (proteção de quota). Default 5 = 100 resultados. */
  maxPages?: number;
}

interface SerpApiLocalResult {
  position?: number;
  title?: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  reviews_link?: string;
  reviews?: number;
  rating?: number;
  price?: string;
  type?: string;
  types?: string[];
  address?: string;
  phone?: string;
  website?: string;
  description?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  hours?: unknown;
  open_state?: string;
  thumbnail?: string;
  service_options?: Record<string, boolean>;
}

interface SerpApiAccountResponse {
  account_id: string;
  api_key: string;
  account_email?: string;
  plan_id?: string;
  searches_per_month?: number;
  this_month_usage?: number;
  this_hour_searches?: number;
  total_searches_left?: number;
  account_rate_limit_per_hour?: number;
}

/**
 * Erros específicos do SerpAPI com códigos padronizados pra UI saber o que mostrar.
 */
export class SerpApiError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_KEY'
      | 'QUOTA_EXCEEDED'
      | 'RATE_LIMITED'
      | 'NETWORK'
      | 'UNKNOWN',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SerpApiError';
  }
}

@Injectable()
export class SerpApiProvider implements LeadProvider {
  public readonly kind: ProviderKind = 'serpapi';
  public readonly name: string;

  private readonly logger = new Logger(SerpApiProvider.name);
  private readonly http: AxiosInstance;
  private readonly engine: 'google_maps' | 'google_local';
  private readonly maxPages: number;

  constructor(private readonly options: SerpApiOptions) {
    this.name = options.name;
    this.engine = options.engine ?? 'google_maps';
    this.maxPages = options.maxPages ?? 5;
    this.http = axios.create({
      baseURL: 'https://serpapi.com',
      timeout: 60_000,
    });
  }

  /**
   * Ping no endpoint /account — valida key e retorna info da conta.
   * Usado pelo endpoint público "test connection" e pelo circuit breaker.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const account = await this.fetchAccount();
      if (account.total_searches_left !== undefined && account.total_searches_left <= 0) {
        this.logger.warn(`SerpAPI sem quota restante (plano ${account.plan_id})`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`SerpAPI indisponível: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Endpoint público usado pela UI de Settings → "Testar conexão".
   * Retorna info amigável ou lança SerpApiError.
   */
  async fetchAccount(): Promise<SerpApiAccountResponse> {
    try {
      const { data } = await this.http.get<SerpApiAccountResponse>('/account', {
        params: { api_key: this.options.apiKey },
      });
      return data;
    } catch (err) {
      throw this.translateError(err);
    }
  }

  /**
   * Busca principal. Pagina automaticamente até atingir `limit` ou `maxPages`.
   */
  async search(params: SearchParams): Promise<RawLead[]> {
    const limit = params.limit ?? 100;
    const query = this.buildQuery(params);
    const collected: RawLead[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < this.maxPages; page++) {
      if (collected.length >= limit) break;

      const start = page * 20; // Google Maps retorna ~20 por página

      this.logger.debug(`SerpAPI busca "${query}" página ${page + 1} (start=${start})`);

      let data: { local_results?: SerpApiLocalResult[] };
      try {
        const response = await this.http.get('/search.json', {
          params: {
            engine: this.engine,
            q: query,
            hl: params.locale ?? 'pt-br',
            google_domain: 'google.com.br',
            gl: 'br',
            start,
            api_key: this.options.apiKey,
          },
        });
        data = response.data;
      } catch (err) {
        throw this.translateError(err);
      }

      const results = data.local_results ?? [];
      if (results.length === 0) {
        // sem mais resultados — para de paginar
        break;
      }

      for (const r of results) {
        const id = String(r.place_id ?? r.data_id ?? r.data_cid ?? `${query}-${start}-${r.position ?? 0}`);
        if (seenIds.has(id)) continue; // dedupe intra-busca
        seenIds.add(id);

        collected.push({
          sourceKind: this.kind,
          sourceId: id,
          raw: r as unknown as Record<string, unknown>,
        });

        if (collected.length >= limit) break;
      }
    }

    this.logger.log(
      `SerpAPI retornou ${collected.length} resultados para "${query}"`,
    );
    return collected;
  }

  /**
   * Normalização — traduz estrutura do SerpAPI para schema do Prospect.
   * Pura, sem I/O, fácil de testar unitariamente.
   */
  normalize(raws: RawLead[]): NormalizedLead[] {
    return raws.map((r) => {
      const d = r.raw as unknown as SerpApiLocalResult;
      const { city, state } = parseAddress(d.address);

      return {
        sourceKind: this.kind,
        sourceId: r.sourceId,
        name: (d.title ?? 'Sem nome').trim(),
        phone: normalizePhone(d.phone),
        whatsapp: undefined, // SerpAPI não distingue; whatsapp inferido depois se phone for mobile
        website: normalizeUrl(d.website),
        instagram: extractInstagramFromUrl(d.website),
        address: d.address?.trim(),
        city,
        state,
        country: 'BR',
        latitude: d.gps_coordinates?.latitude,
        longitude: d.gps_coordinates?.longitude,
        niche: inferNiche(d.type, d.types),
        description: d.description?.trim(),
        googleRating: typeof d.rating === 'number' ? d.rating : undefined,
        googleReviews: typeof d.reviews === 'number' ? d.reviews : undefined,
        extra: {
          priceLevel: d.price,
          types: d.types,
          thumbnail: d.thumbnail,
          openState: d.open_state,
          serviceOptions: d.service_options,
        },
      };
    });
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  /**
   * Constrói a query final pra SerpAPI.
   * Formato: "{nicho} {localização}" — ex: "clínica odontológica Recife PE"
   */
  private buildQuery(params: SearchParams): string {
    return `${params.niche.trim()} ${params.location.trim()}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Traduz erros do Axios/SerpAPI em erros tipados do nosso domínio.
   * Baseado em https://serpapi.com/search-api (códigos de resposta).
   */
  private translateError(err: unknown): SerpApiError {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const apiError =
        (err.response?.data as { error?: string })?.error ?? err.message;

      if (status === 401) {
        return new SerpApiError(
          'INVALID_KEY',
          'API key do SerpAPI inválida ou revogada',
          err,
        );
      }
      if (status === 402) {
        return new SerpApiError(
          'QUOTA_EXCEEDED',
          'Quota mensal do SerpAPI esgotada. Faça upgrade do plano ou aguarde renovação.',
          err,
        );
      }
      if (status === 429) {
        return new SerpApiError(
          'RATE_LIMITED',
          'Muitas requisições em pouco tempo. Aguarde alguns segundos.',
          err,
        );
      }
      if (!err.response) {
        return new SerpApiError('NETWORK', `Falha de rede: ${err.message}`, err);
      }
      return new SerpApiError('UNKNOWN', `SerpAPI retornou erro: ${apiError}`, err);
    }
    return new SerpApiError(
      'UNKNOWN',
      (err as Error)?.message ?? 'Erro desconhecido no SerpAPI',
      err,
    );
  }
}

// ===========================================================================
// Helpers de normalização (exportados pra testes unitários)
// ===========================================================================

/**
 * Tenta extrair cidade e estado do endereço brasileiro do Google.
 * Padrões mais comuns no SerpAPI Google Maps Brasil:
 *   "Rua X, 123 - Boa Viagem, Recife - PE, 51020-000"
 *   "Av Paulista, 1000 - Bela Vista, São Paulo - SP"
 *   "R. Itapetinga - Jardim Pacaembu, Valinhos - SP, 13273-221"
 *
 * Heurística: pega o último token antes do CEP, separa por hífen e vírgulas.
 */
export function parseAddress(address?: string): { city?: string; state?: string } {
  if (!address) return {};
  const clean = address.replace(/,?\s*\d{5}-?\d{3}\s*$/, '').trim(); // remove CEP do final

  // tenta pegar "cidade - UF" (padrão mais comum)
  const cityStateMatch = clean.match(/([^,\-]+)\s*-\s*([A-Z]{2})(?:\s*,|$)/);
  if (cityStateMatch) {
    return {
      city: cityStateMatch[1].trim(),
      state: cityStateMatch[2].toUpperCase(),
    };
  }

  // fallback — último segmento antes do traço final
  const segments = clean.split(',').map((s) => s.trim());
  const last = segments[segments.length - 1];
  if (last && /^[A-Z]{2}$/.test(last)) {
    return { state: last, city: segments[segments.length - 2]?.trim() };
  }

  return {};
}

/**
 * Remove caracteres não-numéricos mas preserva o "+" internacional.
 */
export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.length >= 8 ? cleaned : undefined;
}

/**
 * Garante que URL tenha protocolo e seja válida.
 */
export function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Se o "site" da empresa aponta pro Instagram, extrai o @.
 */
export function extractInstagramFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Infere um "nicho" amigável a partir dos types do Google Places.
 * O Google retorna types como ["dentist", "doctor", "establishment"] — pegamos o mais específico.
 */
export function inferNiche(primary?: string, types?: string[]): string | undefined {
  const raw = primary ?? types?.[0];
  if (!raw) return undefined;

  const map: Record<string, string> = {
    dentist: 'Clínica Odontológica',
    doctor: 'Clínica Médica',
    hair_salon: 'Salão de Beleza',
    beauty_salon: 'Salão de Beleza',
    barber_shop: 'Barbearia',
    restaurant: 'Restaurante',
    cafe: 'Cafeteria',
    bakery: 'Padaria',
    bar: 'Bar',
    gym: 'Academia',
    pharmacy: 'Farmácia',
    veterinary_care: 'Clínica Veterinária',
    pet_store: 'Pet Shop',
    real_estate_agency: 'Imobiliária',
    lawyer: 'Advocacia',
    accounting: 'Contabilidade',
    school: 'Escola',
    store: 'Comércio',
    clothing_store: 'Loja de Roupas',
    shoe_store: 'Loja de Calçados',
  };

  return map[raw] ?? prettifyType(raw);
}

function prettifyType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
