/**
 * @file proposal-templates.seed.ts
 * @description
 *   Templates padrão do sistema (teamId=null → global).
 *   São criados na inicialização caso não existam.
 *
 *   Prompts foram curados com boas práticas comerciais pra propostas
 *   de design gráfico/branding e desenvolvimento web/apps.
 *
 *   Cada template define:
 *     - outline: ordem das seções do HTML gerado
 *     - defaultPricing: faixas sugeridas pra IA
 *     - aiPrompt: instruções específicas anexadas ao system prompt base
 */

import { ProposalTemplateCategory } from '@prisma/client';

export interface TemplateSeed {
  name: string;
  category: ProposalTemplateCategory;
  description: string;
  outline: string[];
  defaultPricing: {
    basic: [number, number];
    intermediate: [number, number];
    premium: [number, number];
  };
  aiPrompt: string;
}

export const DEFAULT_TEMPLATES: TemplateSeed[] = [
  // ---------------------------------------------------------------------
  // Design Gráfico / Branding
  // ---------------------------------------------------------------------
  {
    name: 'Design Gráfico / Branding',
    category: 'DESIGN',
    description:
      'Identidade visual, branding, material promocional. Foca em construção de marca e aplicações gráficas.',
    outline: [
      'hero',           // headline impactante + CTA no topo
      'diagnostico',    // 3-5 pontos de oportunidade detectados no lead
      'solucao',        // narrativa de como vai resolver
      'processo',       // etapas (descoberta → conceito → refinamento → entrega)
      'entregaveis',    // lista concreta (logo, paleta, manual, papelaria...)
      'planos',         // 3 tiers
      'prazo',          // timeline estimado
      'condicoesPagamento',
      'cta',            // chamada final
    ],
    defaultPricing: {
      basic:        [800, 2500],   // identidade básica: logo + paleta + 1 aplicação
      intermediate: [2500, 6000],  // + manual de marca + 3-5 aplicações + social media
      premium:      [6000, 15000], // brand strategy + identidade completa + naming + papelaria
    },
    aiPrompt: `Você é um(a) designer/estrategista de marca experiente.
Ao gerar propostas de design/branding:

1. Sempre inclua o PROCESSO criativo em 4 fases: Descoberta → Conceito → Refinamento → Entrega.
2. No DIAGNÓSTICO, use os dados do lead (rating Google, presença digital, nicho) pra detectar oportunidades concretas.
   Exemplos de oportunidades a procurar:
     - Ausência de identidade visual consistente
     - Logo desatualizado ou amador
     - Falta de presença em redes sociais
     - Material promocional dissonante
3. Nos ENTREGÁVEIS, seja específico com quantidades (ex: "3 propostas de logo", "paleta de 5 cores", "manual de marca de 15 páginas").
4. Nos PLANOS, diferencie por QUANTIDADE de aplicações, NÃO por qualidade (qualidade é sempre a mesma).
5. Tom: inspirador mas técnico. Evite jargão excessivo. Use "marca" em vez de "brand" em pt-BR.
6. No HERO, crie headlines curtas e diretas (máx 12 palavras).`,
  },

  // ---------------------------------------------------------------------
  // Desenvolvimento Web / Apps
  // ---------------------------------------------------------------------
  {
    name: 'Desenvolvimento Web / Sistemas',
    category: 'WEB_DEV',
    description:
      'Sites institucionais, landing pages, e-commerces, apps e sistemas sob medida. Foca em tecnologia, UX e escalabilidade.',
    outline: [
      'hero',
      'diagnostico',
      'solucao',
      'escopoTecnico',   // stack, recursos, integrações
      'processo',        // metodologia (discovery → design → dev → QA → deploy)
      'planos',
      'prazo',
      'suporte',         // manutenção/SLA pós-entrega
      'condicoesPagamento',
      'cta',
    ],
    defaultPricing: {
      basic:        [2500, 6000],   // landing page / site institucional simples
      intermediate: [6000, 18000],  // site completo com CMS, e-commerce pequeno
      premium:      [18000, 60000], // sistema sob medida, app, e-commerce robusto
    },
    aiPrompt: `Você é um(a) desenvolvedor(a) full-stack sênior com experiência comercial.
Ao gerar propostas de desenvolvimento:

1. No DIAGNÓSTICO, identifique problemas técnicos/estratégicos usando dados do lead.
   Exemplos comuns:
     - Não tem site próprio (opcional: dependência só de Instagram)
     - Site desatualizado (sem responsividade, sem SEO, carregamento lento)
     - Ausência de sistema de agendamento/pedidos
     - Falta de integração com WhatsApp/pagamentos
2. No ESCOPO TÉCNICO, liste funcionalidades concretas (não use "etc."):
     - Páginas (institucional, serviços, contato, blog)
     - Integrações (WhatsApp API, Google Analytics, Meta Pixel, Stripe/MercadoPago)
     - Responsividade mobile-first
     - SEO on-page
     - CMS admin (se aplicável)
3. Mencione tecnologias modernas SEM jargão excessivo: "Next.js moderno", "hospedagem em nuvem de alta performance", "banco PostgreSQL".
4. Nos PLANOS, diferencie por ESCOPO (quantidade de páginas/features), não por qualidade.
5. Sempre inclua SUPORTE pós-entrega (30 dias grátis no Básico, 90 dias no Intermediário, 12 meses no Premium).
6. Tom: técnico mas acessível. Explique valor de negócio, não só tecnologia.
7. No HERO, foque em resultado (ex: "Um site que gera leads enquanto você atende clientes").`,
  },
];
