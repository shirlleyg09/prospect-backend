import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminUsersService } from '../services/admin-users.service';

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get('internal')
  listInternal() { return this.svc.listAdminUsers(); }

  @Post('internal')
  createInternal(@Body() dto: any) { return this.svc.createAdminUser(dto); }

  @Get('clients')
  listClients(
    @Query('page') page = '1',
    @Query('perPage') perPage = '25',
    @Query('search') search?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.svc.listClientUsers({ page: +page, perPage: +perPage, search, teamId });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) { return this.svc.updateUser(id, dto); }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) { return this.svc.deactivateUser(id); }
}
