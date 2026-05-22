/**
 * @file message-templates.seed.ts
 * @description
 *   Templates globais de mensagem por situação de venda.
 *   Cada um tem prompt curado pra IA gerar mensagem contextualizada.
 *
 *   São criados ao boot do módulo. Idempotente.
 */

import { InteractionChannel, MessageTemplateCategory } from '@prisma/client';

export interface MessageTemplateSeed {
  name: string;
  category: MessageTemplateCategory;
  channel: InteractionChannel;
  description: string;
  aiPrompt: string;
}

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplateSeed[] = [
  // ---------------------------------------------------------------------
  // PRIMEIRO CONTATO — WhatsApp
  // ---------------------------------------------------------------------
  {
    name: 'Primeiro Contato — WhatsApp',
    category: 'PRIMEIRO_CONTATO',
    channel: 'WHATSAPP',
    description:
      'Mensagem inicial para um lead que nunca foi contatado. Tom amigável, breve, foca em problema detectado pela IA.',
    aiPrompt: `Você está enviando a PRIMEIRA mensagem por WhatsApp para um lead.

REGRAS:
1. Comece com saudação informal usando o nome do lead (ex: "Oi, [Nome]!")
2. Mencione UM problema/oportunidade específico que detectou no lead (use os insights)
3. Termine com uma pergunta aberta que convide a conversa
4. MÁXIMO 4 linhas curtas, sem jargão técnico
5. Tom: humano, próximo, sem soar comercial
6. NUNCA use "prezado", "venho por meio desta", "favor"
7. NÃO mencione planos, preços ou propostas — só desperte interesse
8. NÃO peça pra agendar reunião ainda — só inicie diálogo`,
  },

  // ---------------------------------------------------------------------
  // FOLLOW-UP — WhatsApp
  // ---------------------------------------------------------------------
  {
    name: 'Follow-up — WhatsApp',
    category: 'FOLLOW_UP',
    channel: 'WHATSAPP',
    description:
      'Resgate de lead que recebeu primeira mensagem mas não respondeu. Tom leve, sem pressão.',
    aiPrompt: `Você está fazendo FOLLOW-UP de uma conversa que não teve resposta.

REGRAS:
1. Não soe insistente. Comece reconhecendo que pode ter sido mau momento.
2. Traga UM novo elemento de valor — um insight, dado, ou pergunta diferente
3. Deixe claro que está disponível mas sem pressão
4. MÁXIMO 3 linhas
5. Use frases como "passei pra ver", "caso ainda faça sentido", "fica à vontade"
6. NUNCA repita literalmente a primeira mensagem
7. NÃO use "lembrando", "conforme nossa conversa anterior" (passa frio)
8. Termine sem CTA forte — só uma porta aberta`,
  },

  // ---------------------------------------------------------------------
  // QUEBRA DE OBJEÇÃO — WhatsApp
  // ---------------------------------------------------------------------
  {
    name: 'Quebra de Objeção — WhatsApp',
    category: 'QUEBRA_OBJECAO',
    channel: 'WHATSAPP',
    description:
      'Resposta empática a uma objeção comum (preço, tempo, "vou pensar"). Foco em valor antes de defender.',
    aiPrompt: `Você está respondendo a uma OBJEÇÃO do lead. A objeção típica veio em resposta à sua oferta.

Use o "briefing" passado pelo usuário pra saber qual objeção trabalhar. Se não vier briefing, assuma que a objeção é "tá caro" ou "vou pensar e depois retorno".

REGRAS:
1. PRIMEIRO: valide o sentimento ("entendo perfeitamente", "faz total sentido")
2. DEPOIS: traga UM contra-argumento concreto — em formato de pergunta ou dado
3. NUNCA defenda preço atacando a objeção. Reformule o problema.
4. MÁXIMO 5 linhas
5. Use linguagem de troca, não de venda ("posso compartilhar uma forma diferente de ver isso?")
6. NÃO mencione desconto na primeira resposta — desvaloriza
7. Termine com pergunta que convide reflexão, não decisão imediata`,
  },

  // ---------------------------------------------------------------------
  // AGENDAMENTO — WhatsApp
  // ---------------------------------------------------------------------
  {
    name: 'Agendamento — WhatsApp',
    category: 'AGENDAMENTO',
    channel: 'WHATSAPP',
    description:
      'Convite direto pra reunião quando o lead já demonstrou interesse. Oferece 2-3 horários.',
    aiPrompt: `Você está convidando o lead para uma REUNIÃO/CALL. O lead já demonstrou interesse — agora é fechar a agenda.

REGRAS:
1. Seja DIRETO. Sem rodeios.
2. Proponha 2 ou 3 horários específicos (use formato "amanhã 10h, quinta 14h ou sexta 17h")
3. Mencione duração estimada (ex: "rápido, 20 minutos")
4. Mencione formato (call online ou presencial)
5. MÁXIMO 4 linhas
6. NÃO peça pra escolher data — proponha você
7. Termine fechando: "qual desses horários funciona melhor pra você?"
8. Tom: confiante mas amigável, como se já fosse certo`,
  },

  // ---------------------------------------------------------------------
  // RETOMADA — WhatsApp
  // ---------------------------------------------------------------------
  {
    name: 'Retomada de Conversa — WhatsApp',
    category: 'RETOMADA',
    channel: 'WHATSAPP',
    description:
      'Reativa lead frio (30+ dias parado). Tom novo, traz valor primeiro antes de pedir algo.',
    aiPrompt: `Você está RETOMANDO contato com um lead que ficou frio (mais de 30 dias sem conversa).

REGRAS:
1. NÃO finja que foi ontem. Reconheça o tempo: "faz um tempo que não trocamos ideia"
2. Traga uma NOVIDADE relevante — um dado de mercado, novo serviço, insight do nicho
3. NÃO peça nada na primeira mensagem (não pergunte se ainda tem interesse)
4. Posicione como "resgate de relacionamento", não "venda"
5. MÁXIMO 4 linhas
6. Use linguagem casual ("aproveitei pra te mandar isso aqui")
7. Termine sem CTA — só plante uma semente`,
  },

  // ---------------------------------------------------------------------
  // E-MAIL: Primeiro Contato (variante mais formal)
  // ---------------------------------------------------------------------
  {
    name: 'Primeiro Contato — E-mail',
    category: 'PRIMEIRO_CONTATO',
    channel: 'EMAIL',
    description:
      'E-mail de prospecção fria, mais elaborado. Foco em problema + insight + CTA discreto.',
    aiPrompt: `Você está enviando E-MAIL de prospecção fria — primeiro contato.

ESTRUTURA OBRIGATÓRIA:
1. SUBJECT (linha de assunto): máximo 50 caracteres, desperte curiosidade sem ser clickbait
2. CORPO:
   - Saudação formal mas humana
   - Parágrafo 1: contexto curto sobre quem é você (1 frase)
   - Parágrafo 2: problema específico que detectou no lead (use insights)
   - Parágrafo 3: oferta de valor — insight, recurso, ou pergunta
   - CTA discreto — sem pressão de "agende já"
3. Assinatura simples

REGRAS:
- MÁXIMO 8 linhas no corpo
- Tom profissional mas próximo (você, não senhor/senhora)
- NÃO use "venho por meio desta", "aproveitando o ensejo"
- NÃO mencione preços ou propostas
- Use o nome do lead pelo menos 2 vezes`,
  },

  // ---------------------------------------------------------------------
  // INSTAGRAM DM
  // ---------------------------------------------------------------------
  {
    name: 'Primeiro Contato — Instagram DM',
    category: 'PRIMEIRO_CONTATO',
    channel: 'INSTAGRAM',
    description:
      'DM no Instagram. Tom mais leve ainda, foca em algo visto no perfil do lead.',
    aiPrompt: `Você está enviando DM no INSTAGRAM para o lead.

REGRAS:
1. Comece SEMPRE comentando algo do perfil dele (uma postagem, um produto, o estilo)
2. NUNCA copie e cole — pareça genuíno, como se realmente tivesse visto
3. Só DEPOIS de elogiar/comentar, mencione brevemente o que faz
4. Termine com pergunta aberta sobre o trabalho dele
5. MÁXIMO 3 linhas
6. Use emojis com moderação (1-2 max, nunca no início)
7. Tom super informal — IG é território social, não corporativo
8. NUNCA peça pra responder ou trocar contato — deixe rolar natural`,
  },
];
