/**
 * @file provider-config.service.ts
 * @description
 *   CRUD de ProviderConfig com dois princípios invioláveis:
 *     1. Secrets (api keys) são criptografados no DB com AES-256-GCM.
 *     2. Secrets NUNCA saem deste módulo em respostas HTTP.
 *
 *   A UI só sabe: "esse provider tem secrets configurados? sim/não".
 *   Quando o usuário quer atualizar, manda a key nova inteira.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProviderConfig,
  ProviderKind as DbProviderKind,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import type { UpsertProviderConfigDto } from './dto/provider-config.dto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Shape retornado pela API — SEM os secrets em claro.
 */
export interface ProviderConfigPublic {
  id: string;
  kind: DbProviderKind;
  name: string;
  enabled: boolean;
  priority: number;
  /** Lista de nomes de secrets configurados (ex: ['apiKey']) — valor nunca retornado. */
  configuredSecretKeys: string[];
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProviderConfigService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Chave de encriptação vem do .env — hex de 64 chars = 32 bytes
    const raw = config.get<string>('PROVIDER_ENCRYPTION_KEY');
    if (!raw || raw.length !== 64) {
      throw new Error(
        'PROVIDER_ENCRYPTION_KEY ausente ou inválida no .env (precisa ter 64 caracteres hexadecimais)',
      );
    }
    this.encryptionKey = Buffer.from(raw, 'hex');
  }

  /**
   * Lista todas as configs do team — com secrets redacted.
   */
  async list(teamId: string): Promise<ProviderConfigPublic[]> {
    const configs = await this.prisma.providerConfig.findMany({
      where: { teamId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return configs.map((c) => this.toPublic(c));
  }

  /**
   * Cria ou atualiza uma config (unique por teamId + name).
   * Se a config já existe, mescla secrets — permite atualizar só uma key sem perder as outras.
   */
  async upsert(
    teamId: string,
    dto: UpsertProviderConfigDto,
  ): Promise<ProviderConfigPublic> {
    const existing = await this.prisma.providerConfig.findFirst({
      where: { teamId, name: dto.name },
    });

    // Criptografa os secrets novos
    const encryptedNewSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(dto.secrets)) {
      if (typeof value !== 'string' || value.trim().length === 0) continue;
      encryptedNewSecrets[key] = this.encrypt(value);
    }

    let mergedSecrets: Record<string, string>;
    if (existing) {
      const existingSecrets = (existing.secrets as Record<string, string>) ?? {};
      // Merge: secrets novos substituem, os antigos que não foram tocados ficam
      mergedSecrets = { ...existingSecrets, ...encryptedNewSecrets };
    } else {
      mergedSecrets = encryptedNewSecrets;
    }

    const enabled = dto.enabled ?? true;
    const priority = dto.priority ?? 10;
    const config = (dto.config ?? {}) as Prisma.InputJsonValue;
    const secretsJson = mergedSecrets as unknown as Prisma.InputJsonValue;

    const saved = await this.prisma.providerConfig.upsert({
      where: existing ? { id: existing.id } : { id: '__nonexistent__' },
      create: {
        teamId,
        kind: dto.kind as DbProviderKind,
        name: dto.name,
        enabled,
        priority,
        secrets: secretsJson,
        config,
      },
      update: {
        kind: dto.kind as DbProviderKind,
        enabled,
        priority,
        secrets: secretsJson,
        config,
      },
    });

    return this.toPublic(saved);
  }

  async remove(teamId: string, id: string): Promise<void> {
    const config = await this.prisma.providerConfig.findFirst({
      where: { id, teamId },
    });
    if (!config) {
      throw new NotFoundException('Configuração de provider não encontrada');
    }
    await this.prisma.providerConfig.delete({ where: { id } });
  }

  /**
   * Utilidade pública: descriptografa secrets de uma config.
   * Usado APENAS pelo ProviderService quando vai instanciar um provider real.
   * Nunca expor isso em rota HTTP.
   */
  decryptSecrets(config: ProviderConfig): Record<string, string> {
    const encrypted = (config.secrets as Record<string, string>) ?? {};
    const decrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(encrypted)) {
      decrypted[key] = this.decrypt(value);
    }
    return decrypted;
  }

  // -------------------------------------------------------------------------
  // Helpers — criptografia AES-256-GCM
  // -------------------------------------------------------------------------

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Formato: iv:authTag:ciphertext (todos em hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !authTagHex || !dataHex) {
      throw new Error('Formato de secret criptografado inválido');
    }
    const decipher = crypto.createDecipheriv(
      ALGO,
      this.encryptionKey,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private toPublic(config: ProviderConfig): ProviderConfigPublic {
    const secretsObj = (config.secrets as Record<string, string>) ?? {};
    return {
      id: config.id,
      kind: config.kind,
      name: config.name,
      enabled: config.enabled,
      priority: config.priority,
      configuredSecretKeys: Object.keys(secretsObj),
      config: (config.config as Record<string, unknown>) ?? {},
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
