/**
 * @file ai-provider.interface.ts
 * @description
 *   Abstração sobre o LLM concreto (OpenAI, Anthropic, Bedrock, modelo local).
 *   O AIService nunca chama SDK de vendor diretamente.
 */

export interface AICompletionRequest {
  /** prompt do sistema */
  system?: string;
  /** prompt do usuário */
  user: string;
  /** se verdadeiro, espera-se JSON válido no retorno */
  jsonMode?: boolean;
  /** temperatura — padrão 0.2 para tasks analíticas */
  temperature?: number;
  /** máx tokens de saída */
  maxTokens?: number;
  /** metadata para tracing */
  tag?: string;
}

export interface AICompletionResponse {
  text: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  complete(req: AICompletionRequest): Promise<AICompletionResponse>;
}
