import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTeam } from '../../common/decorators/current-team.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  list(
    @CurrentTeam() teamId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.list(teamId, {
      unreadOnly: unreadOnly === 'true',
      limit: 50,
    });
  }

  @Patch(':id/read')
  markAsRead(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.service.markAsRead(teamId, id);
  }

  @Post('mark-all-read')
  markAllAsRead(@CurrentTeam() teamId: string) {
    return this.service.markAllAsRead(teamId);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.service.delete(teamId, id);
  }
}
