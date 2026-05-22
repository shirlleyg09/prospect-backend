/**
 * @file openai.provider.ts
 * @description Implementação de AIProvider sobre OpenAI SDK.
 */

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from '../ai-provider.interface';

@Injectable()
export class OpenAIProvider implements AIProvider {
  public readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'gpt-4o-mini';
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const start = Date.now();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
        { role: 'user' as const, content: req.user },
      ],
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 1000,
      response_format: req.jsonMode ? { type: 'json_object' } : undefined,
    });

    const latency = Date.now() - start;
    const text = completion.choices[0]?.message?.content ?? '';

    this.logger.debug(
      `[${req.tag ?? 'ai'}] model=${this.model} tokens_in=${completion.usage?.prompt_tokens} tokens_out=${completion.usage?.completion_tokens} latency=${latency}ms`,
    );

    return {
      text,
      model: this.model,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      latencyMs: latency,
    };
  }
}
