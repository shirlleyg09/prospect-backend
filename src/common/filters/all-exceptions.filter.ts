import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const payload = this.buildPayload(exception, req.url);

    if (payload.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${payload.statusCode}: ${payload.message}`,
        (exception as Error)?.stack,
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${payload.statusCode}: ${payload.message}`);
    }

    res.status(payload.statusCode).json(payload);
  }

  private buildPayload(exception: unknown, path: string): ErrorResponse {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return {
        statusCode: status,
        error: typeof body === 'object' ? (body as any).error ?? exception.name : exception.name,
        message:
          typeof body === 'object'
            ? (body as any).message ?? exception.message
            : String(body),
        path,
        timestamp,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: unique constraint, P2025: record not found
      const isConstraint = exception.code === 'P2002';
      return {
        statusCode: isConstraint ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
        error: 'DatabaseError',
        message: isConstraint
          ? 'Registro já existe (unique constraint)'
          : 'Operação inválida no banco',
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Erro interno — tente novamente em instantes',
      path,
      timestamp,
    };
  }
}
