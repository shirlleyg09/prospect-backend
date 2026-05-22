/**
 * @file prompts.ts
 * @description
 *   Prompts versionados e centralizados. Cada prompt é uma função pura que
 *   recebe contexto e devolve string — facilita testar, versionar, A/B testar.
 */

import { Lead } from '@prisma/client';

export const SCORING_SYSTEM = `Você é um analista sênior de qualificação de leads B2B.
Analise o lead fornecido e atribua pontuações objetivas, conservadoras e fundamentadas.
Responda SEMPRE em JSON válido, sem comentários.`;

export const SCORING_USER = (lead: Partial<Lead>) => `
Analise o seguinte lead e retorne um JSON com os campos:

{
  "leadScore": <int 0-100>,           // qualidade geral do lead
  "opportunityScore": <int 0-100>,    // probabilidade de conversão
  "temperature": "COLD" | "WARM" | "HOT",
  "estimatedTicket": <decimal BRL>,   // ticket médio potencial estimado
  "reasoning": "<texto curto explicando os scores>"
}

Critérios a considerar:
- Presença digital (site, Instagram, Facebook)
- Avaliações Google (nota e número de reviews)
- Engajamento (seguidores, posts recentes)
- Tempo de atividade (quanto mais antigo, mais confiável)
- Completude dos dados de contato

DADOS DO LEAD:
- Nome: ${lead.name ?? 'N/A'}
- Nicho: ${lead.niche ?? 'N/A'}
- Cidade: ${lead.city ?? 'N/A'}/${lead.state ?? 'N/A'}
- Website: ${lead.website ?? 'não encontrado'}
- Instagram: ${lead.instagram ?? 'não encontrado'} (${lead.instagramFollowers ?? 0} seguidores, ${lead.instagramPosts ?? 0} posts)
- Google: ${lead.googleRating ?? 'sem nota'} ★ (${lead.googleReviews ?? 0} reviews)
- Tempo de atividade: ${lead.yearsActive ?? 'desconhecido'} anos
- Telefone: ${lead.phone ? 'sim' : 'não'}
- Email: ${lead.email ? 'sim' : 'não'}
`;

export const INSIGHTS_SYSTEM = `Você é um consultor de marketing e vendas B2B.
Identifique problemas REAIS e específicos do negócio analisado.
Evite generalidades. Cada problema deve ser acionável.`;

export const INSIGHTS_USER = (lead: Partial<Lead>) => `
Liste até 5 problemas/oportunidades detectados neste negócio.
Responda em JSON:

{
  "insights": [
    {
      "problem": "<problema detectado>",
      "evidence": "<evidência nos dados>",
      "suggestion": "<como melhorar>",
      "severity": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "valueReason": "<texto curto: por que esse lead vale a pena>"
}

DADOS:
${JSON.stringify(
  {
    name: lead.name,
    website: lead.website,
    instagram: lead.instagram,
    googleRating: lead.googleRating,
    googleReviews: lead.googleReviews,
    instagramFollowers: lead.instagramFollowers,
    instagramPosts: lead.instagramPosts,
    yearsActive: lead.yearsActive,
  },
  null,
  2,
)}
`;

export const APPROACH_SYSTEM = `Você é um SDR experiente. Escreva mensagens
personalizadas, curtas, sem jargões, com tom humano e próximo.
Nunca prometa o que não sabe cumprir. Nunca minta.`;

export const APPROACH_USER = (lead: Partial<Lead>, channel: string, offer: string) => `
Gere uma mensagem de abordagem para ${channel}.
Produto/serviço que estamos oferecendo: "${offer}".

Requisitos:
- Máximo 4 frases
- Mencione algo concreto sobre o negócio (ex: nota Google, nicho, cidade)
- Termine com uma chamada de ação leve
- Tom: ${channel === 'WHATSAPP' ? 'informal e direto' : channel === 'EMAIL' ? 'profissional' : 'casual'}

Responda em JSON:
{
  "subject": "<apenas se for email, senão null>",
  "body": "<mensagem final>"
}

DADOS DO LEAD:
- Nome: ${lead.name}
- Nicho: ${lead.niche}
- Cidade: ${lead.city}
- Nota Google: ${lead.googleRating ?? 'N/A'}
- Insights: ${JSON.stringify(lead.insights)}
`;
