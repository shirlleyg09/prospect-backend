/**
 * @file groq.provider.ts
 * @description
 *   Provider de IA usando Groq Cloud (console.groq.com).
 *
 *   POR QUÊ GROQ:
 *     - 100% gratuito no free tier (30 req/min, 14.400 req/dia)
 *     - Velocidade altíssima (~5x OpenAI) — ótimo UX pra geração de propostas
 *     - Llama 3.3 70B tem qualidade comparável ao GPT-4o em português
 *     - API compatível com OpenAI (podemos trocar sem refatorar nada)
 *
 *   ERROS TIPADOS:
 *     - INVALID_KEY    → key revogada
 *     - RATE_LIMITED   → bateu 30/min ou 14.400/dia
 *     - MODEL_UNAVAILABLE → Groq fora do ar (raro)
 *     - NETWORK
 *     - UNKNOWN
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from '../ai-provider.interface';

interface GroqOptions {
  apiKey: string;
  /** Modelo padrão. Veja https://console.groq.com/docs/models */
  model?: string;
  /** URL base — normalmente não muda. */
  baseURL?: string;
}

export class GroqError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_KEY'
      | 'RATE_LIMITED'
      | 'MODEL_UNAVAILABLE'
      | 'NETWORK'
      | 'UNKNOWN',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

@Injectable()
export class GroqProvider implements AIProvider {
  public readonly name = 'groq';
  private readonly logger = new Logger(GroqProvider.name);
  private readonly http: AxiosInstance;
  private readonly model: string;

  constructor(opts: GroqOptions) {
    if (!opts.apiKey) {
      throw new Error('GroqProvider: apiKey obrigatória');
    }
    this.model = opts.model ?? 'llama-3.3-70b-versatile';
    this.http = axios.create({
      baseURL: opts.baseURL ?? 'https://api.groq.com/openai/v1',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    });
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    // Retry automático em rate limit (429) e indisponibilidade (503).
    // Backoff exponencial mais longo: 8s, 20s, 45s, 90s.
    // O Groq free tier tem limite de 30 req/min e 14.400/dia. Com vários
    // workers de leads acionando ao mesmo tempo, é fácil estourar — backoff
    // longo dá tempo do bucket reabrir.
    const MAX_ATTEMPTS = 4;
    const BACKOFF_MS = [8_000, 20_000, 45_000, 90_000];

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.completeOnce(req);
      } catch (err) {
        lastErr = err;
        const isRetryable =
          err instanceof GroqError &&
          (err.code === 'RATE_LIMITED' || err.code === 'MODEL_UNAVAILABLE');
        if (!isRetryable || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        const delay = BACKOFF_MS[attempt - 1];
        // eslint-disable-next-line no-console
        console.warn(
          `[GroqProvider] ${(err as GroqError).code} — retry ${attempt}/${MAX_ATTEMPTS} em ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastErr;
  }

  private async completeOnce(
    req: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    const started = Date.now();

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.user });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 2048,
    };

    if (req.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const { data } = await this.http.post('/chat/completions', body);
      const choice = data?.choices?.[0];
      if (!choice?.message?.content) {
        throw new GroqError('UNKNOWN', 'Resposta Groq sem conteúdo');
      }

      return {
        text: choice.message.content,
        model: data.model ?? this.model,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  /**
   * Healthcheck barato: faz uma completion mínima pra validar a key.
   * Usado pelo "Testar conexão" no UI.
   */
  async healthcheck(): Promise<{ model: string; latencyMs: number }> {
    const started = Date.now();
    await this.complete({
      user: 'ping',
      maxTokens: 5,
      temperature: 0,
      tag: 'healthcheck',
    });
    return { model: this.model, latencyMs: Date.now() - started };
  }

  private translateError(err: unknown): GroqError {
    if (err instanceof GroqError) return err;
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const apiError =
        (err.response?.data as { error?: { message?: string } })?.error?.message ??
        err.message;

      if (status === 401) {
        return new GroqError('INVALID_KEY', 'API key do Groq inválida ou revogada', err);
      }
      if (status === 429) {
        return new GroqError(
          'RATE_LIMITED',
          'Limite de requisições Groq atingido. Aguarde alguns segundos.',
          err,
        );
      }
      if (status === 503 || status === 502) {
        return new GroqError('MODEL_UNAVAILABLE', `Groq indisponível: ${apiError}`, err);
      }
      if (!err.response) {
        return new GroqError('NETWORK', `Falha de rede: ${err.message}`, err);
      }
      return new GroqError('UNKNOWN', `Groq retornou erro: ${apiError}`, err);
    }
    return new GroqError('UNKNOWN', (err as Error)?.message ?? 'Erro desconhecido', err);
  }
}
