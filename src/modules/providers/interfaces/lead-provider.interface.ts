/**
 * @file lead-provider.interface.ts
 * @description
 *   Contrato base de todos os provedores de leads. Qualquer nova fonte
 *   (Apify, SerpAPI, Google Places, scrapers próprios) precisa implementar
 *   esta interface. Nenhuma lógica de domínio deve referenciar um provider
 *   concreto — apenas `LeadProvider`.
 */

export type ProviderKind = 'apify' | 'serpapi' | 'google-places' | 'custom';

export interface SearchParams {
  /** nicho/segmento (ex: "barbearia", "clínica odontológica") */
  niche: string;
  /** localização livre ou estruturada */
  location: string;
  /** quantidade máxima desejada */
  limit?: number;
  /** filtros adicionais interpretáveis pelo provider */
  filters?: Record<string, unknown>;
  /** idioma para normalização de endereço, etc */
  locale?: string;
}

/**
 * Lead bruto como veio do provider — pode ter campos incompletos,
 * nomes diferentes, etc. Serve de input para `normalize`.
 */
export interface RawLead {
  sourceKind: ProviderKind;
  sourceId: string;
  raw: Record<string, unknown>;
}

/**
 * Lead padronizado depois do `normalize` — este é o formato
 * que o domínio consome.
 */
export interface NormalizedLead {
  sourceKind: ProviderKind;
  sourceId: string;

  name: string;
  legalName?: string;
  cnpj?: string;

  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;

  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;

  niche?: string;
  description?: string;
  googleRating?: number;
  googleReviews?: number;

  /** campos extras específicos do provider */
  extra?: Record<string, unknown>;
}

/**
 * Resultado de uma execução completa de provider.
 */
export interface ProviderRunResult {
  providerKind: ProviderKind;
  providerName: string;
  startedAt: Date;
  finishedAt: Date;
  leads: NormalizedLead[];
  errors?: Array<{ message: string; cause?: unknown }>;
  meta?: Record<string, unknown>;
}

/**
 * Contrato que todo provider concreto implementa.
 *
 * Design:
 *  - `search` é assíncrona e pode ser longa → chamada dentro de um worker.
 *  - `normalize` é pura e sem I/O → facilita testes unitários.
 *  - `kind` e `name` identificam a instância (podemos ter 2 Apify actors).
 *  - `isAvailable` permite circuit-breaker / fallback.
 */
export interface LeadProvider {
  readonly kind: ProviderKind;
  readonly name: string;

  isAvailable(): Promise<boolean>;

  search(params: SearchParams): Promise<RawLead[]>;

  normalize(raw: RawLead[]): NormalizedLead[];
}
