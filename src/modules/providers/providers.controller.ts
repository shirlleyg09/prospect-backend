/**
 * @file providers.controller.ts
 * @description
 *   Endpoints HTTP para gerenciar configurações de providers e testar conexões.
 *
 *   Protegido por JwtAuthGuard + TeamScopeGuard — mesmo padrão dos outros
 *   controllers (leads, searches, crm).
 *
 *   Secrets NUNCA são retornados nas respostas — só booleans indicando se existem.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import {
  TestConnectionDto,
  UpsertProviderConfigDto,
} from './dto/provider-config.dto';
import { ProviderConfigService } from './provider-config.service';
import { ProviderTestService } from './provider-test.service';

@Controller('providers')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class ProvidersController {
  constructor(
    private readonly config: ProviderConfigService,
    private readonly test: ProviderTestService,
  ) {}

  @Get()
  list(@CurrentTeam() teamId: string) {
    return this.config.list(teamId);
  }

  @Post()
  @HttpCode(200)
  upsert(
    @CurrentTeam() teamId: string,
    @Body() dto: UpsertProviderConfigDto,
  ) {
    return this.config.upsert(teamId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentTeam() teamId: string, @Param('id') id: string) {
    await this.config.remove(teamId, id);
  }

  /**
   * Retorna o status ao vivo de uma config salva (saldo, rate limit etc.).
   * Descriptografa os secrets internamente — não precisa reenviar a key.
   */
  @Get(':id/status')
  status(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.test.status(teamId, id);
  }

  /**
   * Testa uma configuração sem persistir. Usado pelo botão "Testar conexão".
   * Sempre retorna 200 — o corpo diz se ok: true ou ok: false.
   */
  @Post('test')
  @HttpCode(200)
  testConnection(@Body() dto: TestConnectionDto) {
    return this.test.test(dto);
  }
}
