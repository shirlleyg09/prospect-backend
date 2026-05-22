/**
 * @file message.controller.ts
 * @description
 *   Endpoints HTTP do módulo de mensagens.
 *
 *   Rotas (autenticadas):
 *     GET    /messages/templates
 *     GET    /messages
 *     GET    /messages/:id
 *     DELETE /messages/:id
 *     POST   /messages/generate-template
 *     POST   /messages/generate-free
 *     POST   /messages/:id/refine
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import {
  GenerateFreeMessageDto,
  GenerateFromTemplateDto,
  ListMessageTemplatesDto,
  ListMessagesDto,
  RefineMessageDto,
} from './dto/message.dto';
import { MessageService } from './message.service';

@Controller('messages')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  // -------------------------- TEMPLATES --------------------------

  @Get('templates')
  listTemplates(
    @CurrentTeam() teamId: string,
    @Query() q: ListMessageTemplatesDto,
  ) {
    return this.messages.listTemplates(teamId, {
      channel: q.channel,
      category: q.category,
    });
  }

  // -------------------------- MENSAGENS --------------------------

  @Get()
  list(@CurrentTeam() teamId: string, @Query() q: ListMessagesDto) {
    return this.messages.listMessages(teamId, q);
  }

  @Get(':id')
  findOne(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.messages.findMessageById(teamId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.messages.deleteMessage(teamId, id);
  }

  // -------------------------- GERAÇÃO --------------------------

  /**
   * Geração via template fixo (situação tipo "primeiro contato").
   * IA usa o aiPrompt curado do template.
   */
  @Post('generate-template')
  generateFromTemplate(
    @CurrentTeam() teamId: string,
    @Body() dto: GenerateFromTemplateDto,
  ) {
    return this.messages.generateFromTemplate({
      teamId,
      leadId: dto.leadId,
      templateId: dto.templateId,
      briefing: dto.briefing,
    });
  }

  /**
   * Geração 100% livre — usuário escreve o que quer.
   */
  @Post('generate-free')
  generateFree(
    @CurrentTeam() teamId: string,
    @Body() dto: GenerateFreeMessageDto,
  ) {
    return this.messages.generateFree({
      teamId,
      leadId: dto.leadId,
      channel: dto.channel,
      instruction: dto.instruction,
    });
  }

  /**
   * Refina mensagem já gerada.
   */
  @Post(':id/refine')
  refine(
    @CurrentTeam() teamId: string,
    @Param('id') id: string,
    @Body() dto: RefineMessageDto,
  ) {
    return this.messages.refine({
      teamId,
      messageId: id,
      instruction: dto.instruction,
    });
  }
}
