/**
 * @file proposal.prompts.ts
 * @description
 *   Prompts para a IA que gera e refina propostas.
 *
 *   Estratégia:
 *     - system prompt base com regras universais
 *     - anexar prompt específico do template (aiPrompt do ProposalTemplate)
 *     - formato de resposta rigoroso em JSON
 *
 *   O JSON de saída tem uma estrutura fixa que o frontend renderiza visualmente.
 */

export interface LeadContext {
  name: string;
  niche?: string;
  city?: string;
  state?: string;
  website?: string;
  instagram?: string;
  googleRating?: number;
  googleReviews?: number;
  hasWebsite: boolean;
  insights?: string[];
  description?: string;
}

/**
 * System prompt base anexado ao específico do template.
 */
export const BASE_SYSTEM_PROMPT = `Você é um assistente especialista em propostas comerciais brasileiras.

REGRAS INVIOLÁVEIS:
1. RESPONDA SEMPRE EM JSON VÁLIDO. Sem comentários. Sem markdown. Sem \`\`\`json. Apenas o objeto JSON puro.
2. Escreva em português brasileiro natural. Nunca "brand", "workshop", "insights" — use "marca", "oficina", "percepções".
3. Valores em Real (BRL). NUNCA em USD ou outra moeda.
4. NUNCA invente dados sobre o lead. Se não sabe, omita ou deixe genérico.
5. Tom: profissional, confiante, humano. Evite "cliente" — chame pelo nome da empresa quando possível.
6. Seja específico com números, prazos e entregáveis. Evite "etc." e "entre outros".
7. Headlines do HERO: máximo 12 palavras. Diretas. Focadas em resultado.
8. Cada plano deve ser um salto claro de valor — não só "mais coisas".`;

/**
 * Formato JSON que a IA deve retornar na geração inicial.
 */
export const OUTPUT_SCHEMA = `
ESTRUTURA OBRIGATÓRIA DO JSON DE RESPOSTA:

{
  "title": "string — título interno (ex: 'Proposta para [Nome do Lead]')",
  "content": [
    {
      "kind": "hero",
      "headline": "string até 12 palavras",
      "subheadline": "string 1-2 frases",
      "ctaText": "string curta (ex: 'Vamos conversar?')"
    },
    {
      "kind": "diagnostico",
      "title": "string",
      "points": [
        { "label": "string curta", "description": "1-2 frases" }
      ]
    },
    {
      "kind": "solucao",
      "title": "string",
      "description": "parágrafo único, 3-5 frases"
    },
    {
      "kind": "processo",
      "title": "string",
      "steps": [
        { "number": 1, "label": "string", "description": "1-2 frases" }
      ]
    },
    {
      "kind": "escopoTecnico" OU "entregaveis",
      "title": "string",
      "items": [
        { "label": "string", "description": "string opcional" }
      ]
    },
    {
      "kind": "prazo",
      "title": "string",
      "estimativa": "string (ex: '2 a 3 semanas', '45 dias corridos')"
    },
    {
      "kind": "suporte",
      "title": "string",
      "description": "string"
    },
    {
      "kind": "cta",
      "headline": "string",
      "description": "string",
      "buttonText": "string"
    }
  ],
  "plans": [
    {
      "tier": "BASIC" | "INTERMEDIATE" | "PREMIUM",
      "name": "string (ex: 'Essencial', 'Profissional', 'Completo')",
      "tagline": "string 1 linha",
      "price": number (em BRL, inteiro),
      "features": ["string", "string", ...],
      "highlighted": boolean (true apenas no plano do meio geralmente)
    }
  ]
}

IMPORTANTE:
- INCLUA APENAS as seções listadas no template.outline (não crie seções fora dele).
- O campo "plans" SEMPRE tem exatamente 3 itens (BASIC, INTERMEDIATE, PREMIUM nessa ordem).
- "highlighted: true" deve estar apenas em UM plano, normalmente o INTERMEDIATE.
`;

/**
 * Monta o user prompt da geração inicial com contexto do lead.
 */
export function buildGenerationUserPrompt(args: {
  lead: LeadContext;
  templateOutline: string[];
  templatePricing: {
    basic: [number, number];
    intermediate: [number, number];
    premium: [number, number];
  };
  briefing?: string;
}): string {
  const { lead, templateOutline, templatePricing, briefing } = args;

  const leadBlock = [
    `NOME DA EMPRESA: ${lead.name}`,
    lead.niche ? `NICHO: ${lead.niche}` : null,
    lead.city && lead.state ? `LOCALIZAÇÃO: ${lead.city}/${lead.state}` : null,
    lead.googleRating
      ? `RATING GOOGLE: ${lead.googleRating}★ (${lead.googleReviews ?? 0} avaliações)`
      : null,
    lead.hasWebsite === false ? `TEM SITE: NÃO` : lead.website ? `TEM SITE: ${lead.website}` : null,
    lead.instagram ? `INSTAGRAM: @${lead.instagram}` : null,
    lead.description ? `DESCRIÇÃO: ${lead.description}` : null,
    lead.insights?.length ? `PROBLEMAS DETECTADOS: ${lead.insights.join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `GERE UMA PROPOSTA COMERCIAL para o lead abaixo.

## DADOS DO LEAD
${leadBlock}

## SEÇÕES A INCLUIR (nesta ordem)
${templateOutline.join(', ')}

## FAIXAS DE PREÇO SUGERIDAS (R$)
- BASIC: R$ ${templatePricing.basic[0]} a R$ ${templatePricing.basic[1]}
- INTERMEDIATE: R$ ${templatePricing.intermediate[0]} a R$ ${templatePricing.intermediate[1]}
- PREMIUM: R$ ${templatePricing.premium[0]} a R$ ${templatePricing.premium[1]}

Escolha valores dentro dessas faixas considerando o porte do lead (rating, número de avaliações, presença digital).
Leads com rating alto e muitas avaliações = porte maior = valores mais próximos do topo.

${briefing ? `## BRIEFING EXTRA DO USUÁRIO\n${briefing}\n` : ''}

RESPONDA APENAS COM O JSON ESTRUTURADO CONFORME ESPECIFICADO. Nada mais.`;
}

/**
 * Prompt de refinamento — quando o usuário pede ajuste via chat lateral.
 */
export const REFINEMENT_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

Você está REFINANDO uma proposta já gerada com base numa instrução do usuário.

REGRAS DO REFINAMENTO:
1. Mantenha a ESTRUTURA da proposta (mesmas seções, mesmo schema JSON).
2. Altere APENAS o que o usuário pediu — não mexa em nada mais.
3. Se o pedido for vago (ex: "melhore"), faça ajustes mínimos de clareza sem mudar substância.
4. Se o pedido alterar valores, atualize "plans" mantendo a progressão (PREMIUM sempre > INTERMEDIATE > BASIC).
5. Responda com a proposta COMPLETA atualizada (content + plans), não apenas o trecho alterado.

${OUTPUT_SCHEMA}`;

export function buildRefinementUserPrompt(args: {
  currentProposal: unknown;
  instruction: string;
}): string {
  return `PROPOSTA ATUAL:
${JSON.stringify(args.currentProposal, null, 2)}

PEDIDO DO USUÁRIO: "${args.instruction}"

Atualize a proposta conforme o pedido. Responda APENAS com o JSON completo atualizado.`;
}
