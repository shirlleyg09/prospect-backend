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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamScopeGuard } from '../../common/guards/team-scope.guard';
import { CreateSearchDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('searches')
@UseGuards(JwtAuthGuard, TeamScopeGuard)
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Post()
  create(
    @CurrentTeam() teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSearchDto,
  ) {
    return this.service.create(teamId, userId, dto);
  }

  @Get()
  list(@CurrentTeam() teamId: string) {
    return this.service.list(teamId);
  }

  @Get(':id')
  findOne(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.service.findById(teamId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentTeam() teamId: string, @Param('id') id: string) {
    return this.service.remove(teamId, id);
  }
}
