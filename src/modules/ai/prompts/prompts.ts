/**
 * @file prompts.ts
 * @description
 *   Prompts versionados e centralizados. Cada prompt é uma função pura que
 *   recebe contexto e devolve string — facilita testar, versionar, A/B testar.
 */

import { Lead } from '@prisma/client';

// =============================================================================
// SCORING
// =============================================================================

export const SCORING_SYSTEM = `Você é um analista sênior de qualificação de leads B2B focado em agência digital.
Analise o lead fornecido e atribua pontuações objetivas, conservadoras e fundamentadas.
Seu objetivo é identificar negócios locais com ALTO potencial de contratar serviços digitais
(site, social media, tráfego pago, identidade visual, automação, CRM, landing page ou consultoria).
Responda SEMPRE em JSON válido, sem comentários.`;

export const SCORING_USER = (lead: Partial<Lead>) => `
Analise o seguinte lead e retorne um JSON com os campos:

{
  "leadScore": <int 0-100>,           // qualidade geral do lead
  "opportunityScore": <int 0-100>,    // probabilidade de conversão
  "temperature": "COLD" | "WARM" | "HOT" | "VERY_HOT",
  "estimatedTicket": <decimal BRL>,   // ticket médio potencial estimado
  "reasoning": "<texto curto explicando os scores>"
}

Critérios de temperatura:
- COLD: boa presença digital, já tem site estruturado, redes ativas, poucos sinais de dor
- WARM: site fraco ou desatualizado, redes pouco ativas, comunicação inconsistente
- HOT: sem site OU com site muito básico, tem telefone/WhatsApp, avaliações no Google, presença digital fraca
- VERY_HOT: sem site, negócio ativo e validado (bom volume de avaliações), telefone disponível, dores claras identificadas — alta probabilidade de contratar solução digital

Critérios de score (somar pontos):
- Negócio sem site: +30 pontos (oportunidade clara)
- Tem telefone ou WhatsApp identificado: +15 pontos
- Tem avaliações no Google (≥10 reviews): +10 pontos
- Avaliação Google ≥ 4.0: +10 pontos
- Sem Instagram ou Instagram pouco ativo (<500 seguidores): +10 pontos
- Nicho local com alta demanda por presença digital: +10 pontos
- Dados de contato completos: +5 pontos
- Presença digital totalmente ausente: +10 pontos

Penalizações:
- Site profissional bem estruturado: -20 pontos
- Redes sociais muito ativas (>5k seguidores): -15 pontos
- Dados incompletos (sem telefone, sem localização): -20 pontos

DADOS DO LEAD:
- Nome: ${lead.name ?? 'N/A'}
- Nicho: ${lead.niche ?? 'N/A'}
- Cidade: ${lead.city ?? 'N/A'}/${lead.state ?? 'N/A'}
- Website: ${lead.website ?? 'não encontrado'}
- Instagram: ${lead.instagram ?? 'não encontrado'} (${lead.instagramFollowers ?? 0} seguidores, ${lead.instagramPosts ?? 0} posts)
- Google: ${lead.googleRating ?? 'sem nota'} ★ (${lead.googleReviews ?? 0} reviews)
- Tempo de atividade: ${lead.yearsActive ?? 'desconhecido'} anos
- Telefone: ${lead.phone ? 'sim' : 'não'}
- WhatsApp: ${lead.whatsapp ? 'sim' : 'não'}
- Email: ${lead.email ? 'sim' : 'não'}
`;

// =============================================================================
// INSIGHTS
// =============================================================================

export const INSIGHTS_SYSTEM = `Você é um consultor de marketing e vendas de agência digital B2B.
Identifique problemas REAIS e específicos do negócio analisado.
Evite generalidades. Cada problema deve ser acionável e relevante para venda de serviços digitais.
Pense como um vendedor que quer fechar uma proposta de site, social media, tráfego pago ou automação.`;

export const INSIGHTS_USER = (lead: Partial<Lead>) => `
Liste até 5 problemas/oportunidades detectados neste negócio para venda de serviços digitais.
Responda em JSON:

{
  "insights": [
    {
      "problem": "<problema detectado>",
      "evidence": "<evidência nos dados>",
      "suggestion": "<serviço que resolve / como melhorar>",
      "severity": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "valueReason": "<texto curto: por que esse lead vale a pena e qual serviço oferecer>"
}

Priorize problemas como:
- Ausência de site próprio (altíssima oportunidade)
- Presença digital fraca (baixa nota Google, poucos reviews)
- Sem Instagram ou Instagram abandonado
- Comunicação visual inconsistente
- Falta de captação de clientes online
- Ausência de mecanismo de agendamento online
- Sem estratégia de tráfego pago

DADOS:
${JSON.stringify(
  {
    name: lead.name,
    niche: lead.niche,
    city: lead.city,
    state: lead.state,
    website: lead.website,
    instagram: lead.instagram,
    googleRating: lead.googleRating,
    googleReviews: lead.googleReviews,
    instagramFollowers: lead.instagramFollowers,
    instagramPosts: lead.instagramPosts,
    yearsActive: lead.yearsActive,
    phone: lead.phone ? 'sim' : 'não',
    whatsapp: lead.whatsapp ? 'sim' : 'não',
  },
  null,
  2,
)}
`;

// =============================================================================
// APPROACH MESSAGE
// =============================================================================

export const APPROACH_SYSTEM = `Você é um SDR experiente de agência digital. Escreva mensagens
personalizadas, curtas, sem jargões, com tom humano e próximo.
Nunca prometa o que não sabe cumprir. Nunca minta.
Foque em criar curiosidade e gerar resposta, não em vender direto.`;

export const APPROACH_USER = (lead: Partial<Lead>, channel: string, offer: string) => `
Gere uma mensagem de abordagem para ${channel}.
Produto/serviço que estamos oferecendo: "${offer}".
Agência: Agência Pulsari.

Requisitos:
- Máximo 4 frases
- Mencione algo concreto sobre o negócio (ex: nota Google, nicho, cidade, ausência de site)
- Termine com uma chamada de ação leve que gere resposta
- Tom: ${channel === 'WHATSAPP' ? 'informal e direto, como conversa natural' : channel === 'EMAIL' ? 'profissional mas humano' : 'casual e próximo'}

Responda em JSON:
{
  "subject": "<apenas se for email, senão null>",
  "body": "<mensagem final>"
}

DADOS DO LEAD:
- Nome: ${lead.name}
- Nicho: ${lead.niche}
- Cidade: ${lead.city}
- Nota Google: ${lead.googleRating ?? 'N/A'} (${lead.googleReviews ?? 0} avaliações)
- Site: ${lead.website ?? 'não identificado'}
- Instagram: ${lead.instagram ?? 'não identificado'}
- Insights: ${JSON.stringify(lead.insights)}
`;

// =============================================================================
// SITE PROMPT GENERATION
// =============================================================================

/**
 * Templates visuais por nicho — guiam o LLM a gerar prompts mais precisos.
 */
const NICHE_SITE_TEMPLATES: Record<string, string> = {
  'clínica odontológica': 'visual saúde, branco, azul claro, verde água, limpeza, confiança, agendamento online, tratamentos odontológicos',
  'clínica médica': 'visual saúde premium, branco, azul, verde suave, profissionalismo, humanização, agendamento, especialidades',
  'clínica de estética': 'visual premium, elegante, tons suaves (rose gold, bege, branco), antes/depois, tratamentos, autoridade, agendamento',
  'salão de beleza': 'visual feminino moderno, rosa, dourado, bege, serviços, galeria de trabalhos, agendamento, equipe',
  'barbearia': 'visual masculino urbano, preto, dourado, cinza, vintage ou moderno, cortes, agendamento, equipe',
  'academia': 'visual energético, esportivo, preto, vermelho, laranja, planos, modalidades, horários, matrícula online',
  'restaurante': 'visual gastronômico quente, fotos de pratos, menu, delivery, reservas, ambiente, avaliações',
  'pizzaria': 'visual aconchegante, vermelho, amarelo, pizza em destaque, cardápio, delivery, horários',
  'hamburgeria': 'visual urbano moderno, escuro ou colorido, hambúrguer em destaque, cardápio, delivery, redes sociais',
  'cafeteria': 'visual aconchegante, bege, marrom, café em destaque, cardápio, ambiente, horários, delivery',
  'padaria': 'visual acolhedor, quente, pão em destaque, cardápio, horários, delivery, confiança',
  'escritório de advocacia': 'visual sóbrio e institucional, azul marinho, dourado, preto, seriedade, confiança, áreas de atuação, contato',
  'escritório de contabilidade': 'visual profissional, azul, cinza, verde, confiança, serviços contábeis, clientes, contato',
  'imobiliária': 'visual profissional, imóveis em destaque, busca, captação, venda, aluguel, WhatsApp, localização',
  'pet shop': 'visual divertido e acolhedor, colorido, animais, serviços, agendamento, loja virtual',
  'clínica veterinária': 'visual saúde animal, verde, branco, animais fofos, serviços veterinários, agendamento, emergência',
  'loja de roupas': 'visual fashion, moderno, coleção em destaque, lookbook, tamanhos, WhatsApp, localização',
  'oficina mecânica': 'visual técnico e confiável, azul, laranja, serviços, orçamento online, localização, equipe',
  'empresa de energia solar': 'visual tecnológico, verde, amarelo, sustentabilidade, economia na conta, cases, orçamento',
  default: 'visual moderno, profissional, identidade da marca, serviços, contato fácil, WhatsApp prominente',
};

function getNicheTemplate(niche: string): string {
  const key = Object.keys(NICHE_SITE_TEMPLATES).find((k) =>
    niche?.toLowerCase().includes(k),
  );
  return NICHE_SITE_TEMPLATES[key ?? 'default'];
}

// =============================================================================
// SITE PROMPT — CHAMADO 1: BRIEFING COMPLETO (texto livre, sem JSON)
// =============================================================================

export const SITE_BRIEFING_SYSTEM = `Você é o diretor de criação de uma agência digital brasileira de alta performance especializada em sites para negócios locais.

Sua tarefa é escrever um BRIEFING TÉCNICO E CRIATIVO ULTRA-DETALHADO que será entregue diretamente a uma IA de desenvolvimento (Cursor, Bolt, v0, Lovable ou similar) para construir o site do zero, sem nenhuma pergunta adicional.

REGRAS ABSOLUTAS:
- Use os dados reais fornecidos. Complete lacunas com detalhes plausíveis e criativos.
- Escreva copy real (headlines, subtítulos, textos de seção) usando o nome real do negócio.
- Especifique cores em hex (#RRGGBB), fontes pelo nome exato do Google Fonts, tamanhos em px/rem.
- Cada seção deve ter: nome, layout, copy completo, comportamento, imagens e CTA.
- Mínimo de 1500 palavras. Quanto mais detalhado, melhor.
- Use markdown com # ## ### para estruturar.
- NÃO use JSON. Escreva em prosa técnica direta.`;

export const SITE_BRIEFING_USER = (lead: Partial<Lead>) => {
  const nicheTemplate = getNicheTemplate(lead.niche ?? '');
  const hasNoSite = !lead.website;
  const phone = lead.whatsapp || lead.phone;
  const googleSignal = lead.googleRating
    ? `${lead.googleRating} estrelas com ${lead.googleReviews} avaliações no Google Maps`
    : 'sem presença no Google Maps ainda';

  return `
# BRIEFING PARA CRIAÇÃO DE SITE — ${(lead.name ?? 'NEGÓCIO LOCAL').toUpperCase()}

## DADOS DO NEGÓCIO
- **Nome:** ${lead.name ?? 'N/A'}
- **Segmento/Nicho:** ${lead.niche ?? 'N/A'}
- **Cidade/Estado:** ${lead.city ?? 'N/A'}${lead.state ? ` — ${lead.state}` : ''}
- **Endereço:** ${lead.address ?? 'não informado'}
- **Telefone:** ${lead.phone ?? 'não informado'}
- **WhatsApp:** ${phone ?? 'não informado'}
- **Site atual:** ${lead.website ?? '⚠️ NÃO POSSUI SITE'}
- **Instagram:** ${lead.instagram ? `@${lead.instagram}` : 'não identificado'}
- **Presença Google:** ${googleSignal}
- **Tempo no mercado:** ${lead.yearsActive ? `${lead.yearsActive} anos` : 'negócio estabelecido'}
- **Descrição:** ${lead.description ?? 'negócio local estabelecido na região'}
- **Insights identificados:** ${JSON.stringify(lead.insights ?? [])}

${hasNoSite
  ? `## ⚠️ CONTEXTO CRÍTICO\nEste negócio **NÃO POSSUI SITE**. Este será o PRIMEIRO site — deve impactar imediatamente, transmitir autoridade e converter visitantes em clientes no primeiro acesso. Cada palavra e pixel importa.`
  : `## CONTEXTO\nO site atual é fraco/desatualizado. O novo deve ser radicalmente superior em design, copy e conversão.`
}

## REFERÊNCIAS VISUAIS DO NICHO
${nicheTemplate}

---

Agora escreva o briefing completo seguindo EXATAMENTE esta estrutura:

# BRIEFING COMPLETO DE DESENVOLVIMENTO

## 1. VISÃO GERAL E ESTRATÉGIA

Descreva em detalhes:
- **Objetivo principal do site**: qual ação o visitante deve tomar (ligar, enviar WhatsApp, agendar, solicitar orçamento)
- **Público-alvo detalhado**: quem são, faixa etária, o que buscam, quais dores têm, o que os convence
- **Proposta de valor única**: o que diferencia este negócio da concorrência local
- **Tom de voz e personalidade**: como o site deve "falar" (ex: sóbrio e institucional para advocacia, jovial para salão de beleza)
- **Palavras-chave estratégicas** para SEO local: [nicho] + [cidade], variações

## 2. IDENTIDADE VISUAL COMPLETA

Especifique:
- **Cor primária**: #XXXXXX — [nome da cor] — uso principal (botões, destaques, navbar)
- **Cor secundária**: #XXXXXX — uso em fundos alternativos, cards
- **Cor de destaque/accent**: #XXXXXX — hover states, links, ícones ativos
- **Fundos**: cor do body (#XXXXXX), cor de seções alternadas (#XXXXXX)
- **Textos**: cor do heading (#XXXXXX), cor do body text (#XXXXXX), cor do placeholder (#XXXXXX)
- **Fonte de títulos**: [Nome Exato] (Google Fonts) — peso 700/800 — uso em H1/H2
- **Fonte de texto corrido**: [Nome Exato] (Google Fonts) — peso 400/500 — uso em parágrafos
- **Tamanhos**: H1 = 48px desktop/32px mobile, H2 = 36px/24px, body = 16px/15px
- **Border-radius padrão**: Xpx (cards, botões, inputs)
- **Sombra padrão**: box-shadow: 0 Xpx Xpx rgba(0,0,0,0.X)
- **Estilo geral**: descreva o mood (minimalista, bold, premium, acolhedor, corporativo)
- **Referências visuais**: cite marcas ou sites com estilo similar

## 3. ESTRUTURA COMPLETA — PÁGINA HOME

Para CADA seção abaixo, escreva:
- Layout e dimensões
- Copy exato (headline H1/H2, subtítulo, body text, texto do botão)
- Descrição das imagens/ícones necessários
- Animações/comportamento (scroll reveal, hover, transições)
- Elementos de conversão

### 3.1 HEADER / NAVBAR
- Logo (descrição do estilo), itens do menu, CTA no header
- Comportamento sticky, cor em scroll, menu mobile (hamburger)
- Altura, padding, responsividade

### 3.2 HERO SECTION
- Layout: (fullscreen, split, com mockup, com vídeo de fundo, etc.)
- **Headline H1**: [escreva o texto exato — forte, focado em benefício]
- **Subtítulo**: [texto exato]
- **Parágrafo de apoio**: [texto exato, 2-3 frases]
- **CTA principal**: [texto do botão] → ação (WhatsApp: ${phone ? `wa.me/${phone?.replace(/\D/g, '')}` : 'link a definir'})
- **CTA secundário**: [texto do botão] → ação (scroll para serviços / ligar)
- Imagem de fundo ou elemento visual: [descrever em detalhes]
- Badge de credibilidade (ex: "★ ${lead.googleRating ?? '4.8'} no Google — ${lead.googleReviews ?? '100'}+ clientes atendidos")

### 3.3 SEÇÃO DE CREDENCIAIS / NÚMEROS
- Layout: faixa horizontal com 3-4 stats (counters animados)
- **Stat 1**: número + label (ex: "${lead.googleReviews ?? '150'}+ Clientes Satisfeitos")
- **Stat 2**: número + label (ex: "${lead.yearsActive ?? '10'}+ Anos de Experiência")
- **Stat 3**: número + label (ex: "${lead.googleRating ?? '4.9'} ★ Avaliação Google")
- **Stat 4**: número + label (específico do nicho)
- Animação: contagem progressiva ao entrar na viewport

### 3.4 SERVIÇOS / SOLUÇÕES
- Layout: grid de cards 3 colunas desktop / 1 coluna mobile
- Título da seção: [texto exato]
- Subtítulo: [texto exato]
- Para cada serviço principal do nicho, escreva:
  * Ícone (Lucide/Heroicons, nome exato)
  * Título do serviço
  * Descrição de 2-3 frases
  * CTA do card
- Listar pelo menos 6 serviços específicos do nicho ${lead.niche ?? 'deste negócio'}

### 3.5 SEÇÃO "POR QUE ESCOLHER" / DIFERENCIAIS
- Layout: alternado (imagem esquerda, texto direita — e vice-versa)
- 3-4 diferenciais com:
  * Ícone ou número destacado
  * Título do diferencial
  * Descrição de 2-4 linhas
  * Baseados nos dados reais do negócio

### 3.6 DEPOIMENTOS / PROVA SOCIAL
- Layout: carrossel ou grid de cards
- ${lead.googleRating ? `Integrar avaliações do Google (${lead.googleRating} ★, ${lead.googleReviews} reviews)` : 'Seção para depoimentos de clientes'}
- 3-4 depoimentos fictícios plausíveis para o nicho (nome, cargo/perfil, texto)
- Widget de avaliação com estrelas

### 3.7 SEÇÃO DE CONTATO / CTA FINAL
- Layout: split (formulário esquerda, informações direita)
- Título e subtítulo motivadores para contato
- **Formulário**: Nome, Telefone/WhatsApp, campo específico do nicho, Mensagem, botão enviar
- **Informações de contato**: endereço (${lead.address ?? lead.city}), telefone, WhatsApp, horário de funcionamento
- Google Maps embed (${lead.city ?? 'localização'})
- Ícones de redes sociais

### 3.8 FOOTER
- Logo, slogan curto
- Links úteis (menu secundário)
- Informações de contato compactas
- Redes sociais
- Copyright e política de privacidade
- WhatsApp flutuante fixo (número: ${phone ?? 'a definir'})

## 4. PÁGINAS ADICIONAIS

Para cada página adicional (Sobre Nós, Serviços detalhados, Blog/Artigos, Área do Cliente se aplicável):
- URL slug
- Objetivo da página
- Seções principais com copy
- Meta title e description

## 5. COPY COMPLETO DE TODAS AS SEÇÕES

Escreva os textos FINAIS de cada seção:

**META TITLE**: [título SEO otimizado, máx 60 chars]
**META DESCRIPTION**: [descrição SEO, máx 155 chars, com CTA]

**H1 do Hero**: [texto exato, máx 10 palavras, com benefício claro]
**Subtítulo Hero**: [texto exato, 15-20 palavras]
**Corpo Hero**: [2-3 frases de apoio]

**Título Serviços**: [texto exato]
**Subtítulo Serviços**: [texto exato]

**Título Sobre Nós / A Empresa**: [texto exato]
**Corpo Sobre Nós**: [3-4 parágrafos usando dados reais do negócio]

**Texto de Rodapé (slogan)**: [texto exato]

## 6. COMPONENTES TÉCNICOS OBRIGATÓRIOS

Lista de todos os componentes a implementar:
- Botão WhatsApp flutuante (bottom-right, número: ${phone ?? 'definir'}, cor: #25D366, ícone WhatsApp SVG)
- Google Maps embed (latitude/longitude de ${lead.city ?? 'cidade'}, zoom 15)
- Schema.org LocalBusiness (JSON-LD no <head>)
- Open Graph tags para compartilhamento social
- Lazy loading em todas as imagens
- Fontes: preload das fontes críticas
- Formulário de contato com validação client-side + feedback visual
${lead.instagram ? `- Feed Instagram: mostrar últimas 6 fotos de @${lead.instagram}` : ''}
- Cookie consent (LGPD)
- Botão "Voltar ao topo" (bottom-left)
- Loading skeleton em conteúdo dinâmico

## 7. SEO TÉCNICO

- **URL canônica**: https://[domínio].com.br
- **Sitemap**: páginas a indexar
- **robots.txt**: configuração
- **Schema JSON-LD LocalBusiness** (preencher com dados reais):
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "${lead.name ?? 'nome do negócio'}",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "${lead.city ?? 'cidade'}",
    "addressRegion": "${lead.state ?? 'PE'}",
    "addressCountry": "BR"
  },
  "telephone": "${phone ?? ''}",
  "aggregateRating": ${lead.googleRating ? `{"@type":"AggregateRating","ratingValue":"${lead.googleRating}","reviewCount":"${lead.googleReviews}"}` : 'não disponível'}
}
\`\`\`
- **Keywords alvo**: [listar 8-10 palavras-chave long-tail com cidade]
- **Alt texts**: padrão para cada tipo de imagem

## 8. RESPONSIVIDADE E PERFORMANCE

Breakpoints:
- Mobile: 320px–767px
- Tablet: 768px–1023px
- Desktop: 1024px+

Comportamentos mobile específicos:
- Hero: centralizado, texto menor, CTA WhatsApp em tela cheia
- Grid de serviços: 1 coluna, cards com swipe
- Navbar: hamburger menu com overlay escuro
- Footer: empilhado verticalmente

Performance targets:
- LCP < 2.5s (imagens com loading="lazy", formatos WebP/AVIF)
- CLS < 0.1 (dimensões explícitas em todas as imagens)
- FID < 100ms (JS defer/async)
- Fontes: font-display: swap

## 9. STACK TÉCNICA RECOMENDADA

Sugestão de tecnologia:
- **Framework**: Next.js 14 (App Router) ou Astro (se site estático)
- **Estilização**: Tailwind CSS v3
- **Animações**: Framer Motion (scroll reveals, counters)
- **Formulários**: React Hook Form + Zod
- **Imagens**: next/image com otimização automática
- **Hospedagem**: Vercel (Next.js) ou Netlify (Astro)
- **CMS** (se necessário): Sanity.io ou Contentlayer
- **Analytics**: Google Analytics 4 + Google Tag Manager
`;
};

// =============================================================================
// SITE PROMPT — CHAMADO 2: METADADOS COMPACTOS (JSON)
// =============================================================================

export const SITE_META_SYSTEM = `Você é um especialista em arquitetura de sites. Responda APENAS em JSON válido, sem comentários.`;

export const SITE_META_USER = (lead: Partial<Lead>) => {
  const nicheTemplate = getNicheTemplate(lead.niche ?? '');
  return `
Com base neste negócio, gere metadados para o site:

Negócio: ${lead.name ?? 'N/A'} | Nicho: ${lead.niche ?? 'N/A'} | Cidade: ${lead.city ?? 'N/A'}
Site atual: ${lead.website ?? 'não possui'} | Google: ${lead.googleRating ?? 'sem nota'} ★
Referência visual do nicho: ${nicheTemplate}

Responda:
{
  "siteType": "<institucional | landing-page | agendamento | catalogo | ecommerce>",
  "recommendedSections": ["<nome de cada seção em ordem, mínimo 8>"],
  "visualStyle": "<descrição em 1 parágrafo do estilo visual ideal — cores, tipografia, mood>",
  "primaryCTA": "<texto exato do botão de ação principal, ex: Falar pelo WhatsApp>",
  "estimatedPages": <número inteiro de páginas>
}
`;
};

// Mantém a exportação antiga para compatibilidade — aponta para o novo sistema
export const SITE_PROMPT_SYSTEM = SITE_BRIEFING_SYSTEM;
export const SITE_PROMPT_USER = SITE_BRIEFING_USER;

// =============================================================================
// COMMERCIAL ANALYSIS (abordagem completa)
// =============================================================================

export const COMMERCIAL_ANALYSIS_SYSTEM = `Você é um analista comercial sênior de agência digital.
Faça uma análise completa do lead como se fosse preparar um briefing de vendas.
Seja específico, prático e orientado a resultados.
Responda em JSON válido.`;

export const COMMERCIAL_ANALYSIS_USER = (lead: Partial<Lead>) => `
Analise este lead e gere um briefing comercial completo.

Responda em JSON:
{
  "resumoComercial": "<resumo do negócio e oportunidade em 2-3 frases>",
  "problemasIdentificados": ["<problema 1>", "<problema 2>", "..."],
  "oportunidadeRecomendada": "<serviço principal a oferecer>",
  "melhorServico": "<site | social media | tráfego pago | identidade visual | automação | CRM | landing page | consultoria>",
  "argumentoAbordagem": "<argumento principal de venda personalizado>",
  "mensagemWhatsApp": "<mensagem curta e direta para WhatsApp (máx 3 frases)>",
  "roteiroChamada": "<roteiro resumido para ligação (introdução, gancho, chamada para ação)>",
  "objecoesProvaveis": ["<objeção 1>", "<objeção 2>"],
  "comoContornar": {"<objeção>": "<como responder>"},
  "prioridadeContato": "IMEDIATA" | "ALTA" | "MEDIA" | "BAIXA"
}

DADOS DO LEAD:
- Nome: ${lead.name ?? 'N/A'}
- Nicho: ${lead.niche ?? 'N/A'}
- Cidade: ${lead.city ?? 'N/A'}/${lead.state ?? 'N/A'}
- Site: ${lead.website ?? 'não possui'}
- Instagram: ${lead.instagram ?? 'não identificado'} (${lead.instagramFollowers ?? 0} seguidores)
- Google: ${lead.googleRating ?? 'sem nota'} ★ (${lead.googleReviews ?? 0} reviews)
- Telefone: ${lead.phone ? 'sim' : 'não'}
- WhatsApp: ${lead.whatsapp ? 'sim' : 'não'}
- Score: ${lead.leadScore ?? 'não calculado'}
- Temperatura: ${lead.temperature ?? 'não calculada'}
- Insights: ${JSON.stringify(lead.insights ?? [])}
`;
