import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface JwtPayload {
  sub: string; // userId
  email: string;
  teamId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Busca dados frescos — garante que revogação / mudança de role funcione
    const membership = await this.prisma.membership.findUnique({
      where: { userId_teamId: { userId: payload.sub, teamId: payload.teamId } },
      include: { user: true },
    });

    if (!membership) throw new UnauthorizedException('Acesso ao team revogado');

    return {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      teamId: membership.teamId,
      role: membership.role,
    };
  }
}
