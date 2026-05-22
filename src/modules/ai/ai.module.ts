import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AIService, AI_PROVIDER_TOKEN } from './services/ai.service';
import { GroqProvider } from './strategies/groq.provider';
import { OpenAIProvider } from './strategies/openai.provider';
import { AIProvider } from './ai-provider.interface';

/**
 * Factory do provider de IA.
 *
 * Estratégia:
 *   1. Se `AI_PROVIDER=groq` (default), usa Groq (grátis)
 *   2. Se `AI_PROVIDER=openai`, usa OpenAI
 *   3. Se nenhum funcionar, loga erro e cria um stub (que falha explicitamente ao ser chamado)
 *
 * A key é lida do .env. Em versão futura, poderá ser lida do ProviderConfig
 * do team (criptografada) — permitindo cada team usar sua própria conta/key.
 */
function buildAIProvider(config: ConfigService): AIProvider {
  const providerName = config.get<string>('AI_PROVIDER', 'groq').toLowerCase();

  if (providerName === 'groq') {
    const apiKey = config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error(
        'AI_PROVIDER=groq mas GROQ_API_KEY não está definida no .env. ' +
          'Obtenha uma em https://console.groq.com/keys (grátis).',
      );
    }
    return new GroqProvider({
      apiKey,
      model: config.get<string>('AI_MODEL', 'llama-3.3-70b-versatile'),
    });
  }

  if (providerName === 'openai') {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('AI_PROVIDER=openai mas OPENAI_API_KEY não está definida no .env');
    }
    return new OpenAIProvider({
      apiKey,
      model: config.get<string>('AI_MODEL', 'gpt-4o-mini'),
    });
  }

  throw new Error(
    `AI_PROVIDER desconhecido: "${providerName}". Valores aceitos: groq, openai`,
  );
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AI_PROVIDER_TOKEN,
      inject: [ConfigService],
      useFactory: buildAIProvider,
    },
    AIService,
  ],
  exports: [AIService],
})
export class AIModule {}
