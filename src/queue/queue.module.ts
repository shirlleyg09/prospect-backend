/**
 * @file queue.module.ts
 * @description
 *   Configuração central do BullMQ. Todos os workers são registrados aqui.
 *   Cada módulo que quer PUBLICAR em uma fila importa `BullModule.registerQueue`
 *   localmente; mas os WORKERS ficam todos neste módulo.
 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../modules/ai/ai.module';
import { LeadsModule } from '../modules/leads/leads.module';
import { SearchesModule } from '../modules/searches/searches.module';
import { AIAnalyzeProcessor } from './ai-analyze.processor';
import {
  QUEUE_AI_ANALYZE,
  QUEUE_CONTINUOUS_CAPTURE,
  QUEUE_EXPORT,
  QUEUE_SEARCH_EXECUTE,
} from './queue.constants';
import { SearchExecuteProcessor } from './search-execute.processor';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SearchesModule,
    LeadsModule,
    AIModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get('REDIS_HOST', 'localhost');
        const isUpstash = host.includes('upstash.io');

        return {
          connection: {
            host,
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get('REDIS_PASSWORD'),
            // Upstash exige TLS
            ...(isUpstash && { tls: {} }),
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            removeOnComplete: { count: 1000, age: 24 * 3600 },
            removeOnFail: { count: 500, age: 7 * 24 * 3600 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_SEARCH_EXECUTE },
      { name: QUEUE_AI_ANALYZE },
      { name: QUEUE_CONTINUOUS_CAPTURE },
      { name: QUEUE_EXPORT },
    ),
  ],
  providers: [SearchExecuteProcessor, AIAnalyzeProcessor],
})
export class QueueModule {}
