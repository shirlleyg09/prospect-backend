/**
 * @file message.prompts.ts
 * @description
 *   Prompts para IA gerar mensagens de prospecção.
 *
 *   Estratégia:
 *     - System prompt base com regras universais
 *     - Anexar prompt do template (curado por situação)
 *     - User prompt com contexto do lead + briefing
 *     - Resposta em JSON estrito
 */

export interface LeadContext {
  name: string;
  niche?: string;
  city?: string;
  state?: string;
  website?: string;
  instagram?: string;
  hasWebsite: boolean;
  googleRating?: number;
  googleReviews?: number;
  description?: string;
  insights?: string[];
}

export const BASE_MESSAGE_SYSTEM_PROMPT = `Você é um especialista em mensagens de prospecção comercial brasileiras.

REGRAS INVIOLÁVEIS:
1. RESPONDA SEMPRE EM JSON VÁLIDO. Sem comentários, sem markdown, sem \`\`\`json.
2. Português brasileiro natural, sem regionalismos exagerados.
3. NUNCA invente dados sobre o lead. Se não sabe algo, omita.
4. Tom: humano, próximo, sem soar comercial.
5. Use o nome próprio do lead, NUNCA "prezado(a) cliente".
6. NUNCA mencione "minha solução", "meu produto" — fale do problema/oportunidade DELE.
7. Sem CTAs agressivos como "AGENDE JÁ", "NÃO PERCA".
8. Sem emojis no E-mail. WhatsApp/Instagram aceitam 0-2 com moderação.

FORMATO DA RESPOSTA:

Para canal WHATSAPP ou INSTAGRAM:
{
  "subject": null,
  "body": "texto da mensagem"
}

Para canal EMAIL:
{
  "subject": "linha de assunto até 50 caracteres",
  "body": "corpo do email com quebras de linha \\n"
}`;

/**
 * Monta o user prompt para geração de mensagem por template (situação fixa).
 */
export function buildTemplateMessagePrompt(args: {
  lead: LeadContext;
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM';
  briefing?: string;
}): string {
  const { lead, channel, briefing } = args;

  const leadBlock = [
    `NOME: ${lead.name}`,
    lead.niche ? `NICHO: ${lead.niche}` : null,
    lead.city && lead.state ? `LOCALIZAÇÃO: ${lead.city}/${lead.state}` : null,
    lead.googleRating
      ? `RATING GOOGLE: ${lead.googleRating}★ (${lead.googleReviews ?? 0} avaliações)`
      : null,
    lead.hasWebsite === false
      ? `TEM SITE: NÃO`
      : lead.website
        ? `TEM SITE: ${lead.website}`
        : null,
    lead.instagram ? `INSTAGRAM: @${lead.instagram}` : null,
    lead.description ? `DESCRIÇÃO: ${lead.description}` : null,
    lead.insights?.length
      ? `PROBLEMAS DETECTADOS: ${lead.insights.join('; ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `Gere a mensagem para o lead abaixo.

## DADOS DO LEAD
${leadBlock}

## CANAL
${channel}

${briefing ? `## CONTEXTO/BRIEFING DO USUÁRIO\n${briefing}\n` : ''}

Responda APENAS com o JSON conforme especificado. Nada mais.`;
}

/**
 * Prompt pra geração LIVRE — usuário escreve instrução customizada.
 */
export const FREE_MESSAGE_SYSTEM_PROMPT = `${BASE_MESSAGE_SYSTEM_PROMPT}

Você está gerando uma mensagem com base em uma INSTRUÇÃO LIVRE do usuário.
Siga a instrução fielmente, mas mantenha as regras universais acima.`;

export function buildFreeMessagePrompt(args: {
  lead: LeadContext;
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM';
  instruction: string;
}): string {
  const { lead, channel, instruction } = args;

  const leadBlock = [
    `NOME: ${lead.name}`,
    lead.niche ? `NICHO: ${lead.niche}` : null,
    lead.city && lead.state ? `LOCALIZAÇÃO: ${lead.city}/${lead.state}` : null,
    lead.googleRating
      ? `RATING GOOGLE: ${lead.googleRating}★ (${lead.googleReviews ?? 0} avaliações)`
      : null,
    lead.hasWebsite === false ? `TEM SITE: NÃO` : null,
    lead.instagram ? `INSTAGRAM: @${lead.instagram}` : null,
    lead.insights?.length
      ? `PROBLEMAS DETECTADOS: ${lead.insights.join('; ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `Gere uma mensagem seguindo esta instrução do usuário:

## INSTRUÇÃO
${instruction}

## DADOS DO LEAD
${leadBlock}

## CANAL
${channel}

Responda APENAS com o JSON conforme especificado.`;
}

/**
 * Prompt pra REFINAMENTO de mensagem já gerada.
 */
export const REFINE_MESSAGE_SYSTEM_PROMPT = `${BASE_MESSAGE_SYSTEM_PROMPT}

Você está REFINANDO uma mensagem já gerada com base em um pedido do usuário.

REGRAS:
1. Mantenha a estrutura/canal da mensagem
2. Altere APENAS o que o usuário pediu
3. Responda com a mensagem COMPLETA atualizada (não só o trecho)`;

export function buildRefineMessagePrompt(args: {
  currentMessage: { subject: string | null; body: string };
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM';
  instruction: string;
}): string {
  return `MENSAGEM ATUAL:
${args.currentMessage.subject ? `Assunto: ${args.currentMessage.subject}\n\n` : ''}${args.currentMessage.body}

CANAL: ${args.channel}

PEDIDO DO USUÁRIO: "${args.instruction}"

Atualize a mensagem conforme o pedido. Responda APENAS com o JSON completo.`;
}
