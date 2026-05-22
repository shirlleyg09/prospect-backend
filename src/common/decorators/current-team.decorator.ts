import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrai o teamId do contexto da request, injetado pelo TeamScopeGuard.
 * Uso: list(@CurrentTeam() teamId: string) {}
 */
export const CurrentTeam = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user?.teamId as string;
  },
);
