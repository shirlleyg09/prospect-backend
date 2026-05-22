import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: Error, user: TUser): TUser {
    if (err || !user) throw err ?? new UnauthorizedException('Token inválido ou expirado');
    return user;
  }
}
