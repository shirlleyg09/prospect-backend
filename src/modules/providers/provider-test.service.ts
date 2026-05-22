/**
 * @file provider-test.service.ts
 * @description
 *   Serviço que testa credenciais de providers SEM persistir no banco.
 *   Usado pelo botão "Testar conexão" no modal de configuração.
 *
 *   Resposta padronizada pra UI saber exatamente que mensagem mostrar.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProviderConfigService } from './provider-config.service';
import { TestConnectionDto } from './dto/provider-config.dto';
import {
  GooglePlacesError,
  GooglePlacesProvider,
} from './google-places/google-places.provider';
import { SerpApiError, SerpApiProvider } from './serpapi/serpapi.provider';

export type TestConnectionResult =
  | {
      ok: true;
      details: Record<string, unknown>;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

@Injectable()
export class ProviderTestService {
  private readonly logger = new Logger(ProviderTestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ProviderConfigService,
  ) {}

  async test(dto: TestConnectionDto): Promise<TestConnectionResult> {
    switch (dto.kind) {
      case 'SERPAPI':
        return this.testSerpApi(dto);
      case 'GOOGLE_PLACES':
        return this.testGooglePlaces(dto);
      case 'APIFY':
        return {
          ok: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Teste de Apify ainda não implementado',
          },
        };
      default:
        return {
          ok: false,
          error: {
            code: 'UNSUPPORTED',
            message: `Provider ${dto.kind} não suporta teste de conexão`,
          },
        };
    }
  }

  /**
   * Status de uma config JÁ SALVA — descriptografa os secrets do DB
   * e faz o mesmo healthcheck. Usado pela lista de providers em Settings
   * pra exibir o saldo sem precisar o usuário abrir modal.
   */
  async status(teamId: string, configId: string): Promise<TestConnectionResult> {
    const config = await this.prisma.providerConfig.findFirst({
      where: { id: configId, teamId },
    });
    if (!config) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Configuração não encontrada' },
      };
    }

    const secrets = this.configService.decryptSecrets(config);
    return this.test({
      kind: config.kind as TestConnectionDto['kind'],
      secrets,
      config: (config.config as Record<string, unknown>) ?? {},
    });
  }

  /**
   * Testa SerpAPI: consulta /account e retorna info útil da conta
   * (plano, searches restantes, etc).
   */
  private async testSerpApi(dto: TestConnectionDto): Promise<TestConnectionResult> {
    const apiKey = dto.secrets?.apiKey;
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'MISSING_KEY', message: 'API key é obrigatória' },
      };
    }

    const cfg = dto.config ?? {};
    const provider = new SerpApiProvider({
      name: 'test',
      apiKey,
      engine: (cfg.engine as 'google_maps' | 'google_local') ?? 'google_maps',
    });

    try {
      const account = await provider.fetchAccount();
      return {
        ok: true,
        details: {
          plan: account.plan_id ?? 'desconhecido',
          searchesLeft: account.total_searches_left ?? null,
          searchesPerMonth: account.searches_per_month ?? null,
          usageThisMonth: account.this_month_usage ?? null,
          rateLimitPerHour: account.account_rate_limit_per_hour ?? null,
        },
      };
    } catch (err) {
      if (err instanceof SerpApiError) {
        return {
          ok: false,
          error: { code: err.code, message: err.message },
        };
      }
      this.logger.error(`Erro inesperado ao testar SerpAPI:`, err);
      return {
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: (err as Error).message ?? 'Erro desconhecido',
        },
      };
    }
  }

  /**
   * Testa Google Places: faz uma busca mínima e valida status.
   * Diferente do SerpAPI, Google não tem endpoint de "account info" —
   * a única forma de validar é tentar um text search real (custa 1 request).
   */
  private async testGooglePlaces(
    dto: TestConnectionDto,
  ): Promise<TestConnectionResult> {
    const apiKey = dto.secrets?.apiKey;
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'MISSING_KEY', message: 'API key é obrigatória' },
      };
    }

    const provider = new GooglePlacesProvider({
      name: 'test',
      apiKey,
      fetchDetails: false, // healthcheck mais barato, só text search
    });

    try {
      const result = await provider.fetchAccountCheck();
      return {
        ok: true,
        details: {
          status: result.message,
          // Google Cloud não expõe "quota restante" via API — o usuário
          // precisa consultar o console. Mostramos dica útil aqui.
          budget:
            'Ver uso em: console.cloud.google.com/billing → Relatórios',
        },
      };
    } catch (err) {
      if (err instanceof GooglePlacesError) {
        return {
          ok: false,
          error: { code: err.code, message: this.friendlyGoogleError(err) },
        };
      }
      this.logger.error(`Erro inesperado ao testar Google Places:`, err);
      return {
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: (err as Error).message ?? 'Erro desconhecido',
        },
      };
    }
  }

  /**
   * Converte o erro cru do Google em mensagem útil pro usuário,
   * apontando pra ação corretiva específica.
   */
  private friendlyGoogleError(err: GooglePlacesError): string {
    switch (err.code) {
      case 'INVALID_KEY':
        return 'API key inválida. Verifique se copiou corretamente do Google Cloud Console.';
      case 'REQUEST_DENIED':
        return (
          'Places API não está habilitada neste projeto. ' +
          'Acesse console.cloud.google.com → APIs e Serviços → Biblioteca → "Places API" → Ativar.'
        );
      case 'OVER_QUERY_LIMIT':
        return (
          'Quota excedida ou billing inativo. ' +
          'Verifique se o faturamento está ativo no console.cloud.google.com/billing.'
        );
      case 'NETWORK':
        return 'Falha de rede ao contatar Google Places.';
      default:
        return err.message;
    }
  }
}
