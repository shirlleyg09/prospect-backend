import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ProviderConfigService } from './provider-config.service';
import { ProviderService } from './provider.service';
import { ProviderTestService } from './provider-test.service';
import { ProvidersController } from './providers.controller';

/**
 * @module ProvidersModule
 * @description
 *   Orquestra providers de leads. Expõe:
 *     - ProviderService      → execução de buscas (consumido por módulo de searches)
 *     - ProviderConfigService → CRUD + criptografia de secrets
 *     - HTTP endpoints      → em /providers (UI de Settings)
 *
 *   Implementações concretas (Apify, SerpAPI, GooglePlaces) não saem deste módulo.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ProvidersController],
  providers: [ProviderService, ProviderConfigService, ProviderTestService],
  exports: [ProviderService, ProviderConfigService],
})
export class ProvidersModule {}
