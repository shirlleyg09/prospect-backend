/**
 * @file pg-queue.module.ts
 * @description
 *   Módulo global de filas via pg-boss (Postgres).
 *   Exporta PgQueueService para qualquer módulo que precise enfileirar jobs.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PgQueueService } from './pg-queue.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PgQueueService],
  exports: [PgQueueService],
})
export class PgQueueModule {}
