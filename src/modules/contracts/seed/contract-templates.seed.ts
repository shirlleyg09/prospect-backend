import { ContractCategory } from '@prisma/client';

/**
 * Templates de contrato pré-cadastrados pelo sistema.
 * Disponíveis pra todos os teams. Usuários podem clonar pra customizar.
 *
 * Variáveis disponíveis (prefixadas com {{ }}):
 * - {{nome_cliente}}, {{cpf_cnpj}}, {{endereco_cliente}}
 * - {{email_cliente}}, {{telefone_cliente}}
 * - {{nome_empresa}}, {{cnpj_empresa}}, {{endereco_empresa}}
 * - {{email_empresa}}, {{telefone_empresa}}, {{site_empresa}}
 * - {{valor_proposta}}, {{forma_pagamento}}, {{servico_contratado}}
 * - {{data_inicio}}, {{data_vencimento}}, {{data_assinatura}}
 * - {{numero_contrato}}
 */

export const COMMON_VARIABLES = [
  'nome_cliente',
  'cpf_cnpj',
  'endereco_cliente',
  'email_cliente',
  'telefone_cliente',
  'nome_empresa',
  'cnpj_empresa',
  'endereco_empresa',
  'email_empresa',
  'telefone_empresa',
  'site_empresa',
  'valor_proposta',
  'forma_pagamento',
  'servico_contratado',
  'data_inicio',
  'data_vencimento',
  'data_assinatura',
  'numero_contrato',
];

export const SYSTEM_TEMPLATES = [
  // -----------------------------------------------------------------------
  // 1. PRESTAÇÃO DE SERVIÇO
  // -----------------------------------------------------------------------
  {
    name: 'Prestação de Serviço — Padrão',
    description:
      'Modelo padrão de contrato de prestação de serviço. Cobre escopo, valor, prazos, multa por rescisão e LGPD.',
    category: ContractCategory.PRESTACAO_SERVICO,
    variables: COMMON_VARIABLES,
    content: `# CONTRATO DE PRESTAÇÃO DE SERVIÇO

**Contrato Nº {{numero_contrato}}**

## PARTES

**CONTRATANTE:** {{nome_cliente}}, inscrito(a) no CPF/CNPJ {{cpf_cnpj}}, com endereço em {{endereco_cliente}}, e-mail {{email_cliente}}, telefone {{telefone_cliente}}.

**CONTRATADA:** {{nome_empresa}}, inscrita no CNPJ {{cnpj_empresa}}, com sede em {{endereco_empresa}}, e-mail {{email_empresa}}, telefone {{telefone_empresa}}, site {{site_empresa}}.

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviço, que se regerá pelas cláusulas seguintes:

---

## CLÁUSULA 1ª — DO OBJETO

O presente contrato tem como objeto a prestação dos seguintes serviços pela CONTRATADA: {{servico_contratado}}.

## CLÁUSULA 2ª — DO VALOR E DA FORMA DE PAGAMENTO

Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA o valor total de **R$ {{valor_proposta}}**, na forma de pagamento: {{forma_pagamento}}.

## CLÁUSULA 3ª — DO PRAZO

A vigência deste contrato terá início em {{data_inicio}} e término em {{data_vencimento}}, podendo ser prorrogado mediante acordo entre as partes.

## CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA

A CONTRATADA compromete-se a:
- Executar os serviços com qualidade e dentro do prazo acordado;
- Manter sigilo sobre informações confidenciais da CONTRATANTE;
- Comunicar tempestivamente qualquer alteração que possa impactar o cronograma.

## CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATANTE

A CONTRATANTE compromete-se a:
- Fornecer todas as informações necessárias à execução dos serviços;
- Realizar os pagamentos nas datas acordadas;
- Aprovar entregas dentro de prazo razoável.

## CLÁUSULA 6ª — DA RESCISÃO

Este contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias. Em caso de rescisão imotivada por uma das partes, será aplicada multa de 20% sobre o valor restante do contrato.

## CLÁUSULA 7ª — DA CONFIDENCIALIDADE E LGPD

Ambas as partes se obrigam a manter sigilo sobre todas as informações trocadas durante a execução deste contrato, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).

## CLÁUSULA 8ª — DO FORO

Fica eleito o foro da comarca da sede da CONTRATADA para dirimir quaisquer questões oriundas deste contrato.

---

E por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.

Data: {{data_assinatura}}

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

CONTRATANTE: {{nome_cliente}}

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

CONTRATADA: {{nome_empresa}}
`,
  },

  // -----------------------------------------------------------------------
  // 2. DESENVOLVIMENTO DE SITE
  // -----------------------------------------------------------------------
  {
    name: 'Desenvolvimento de Site',
    description:
      'Modelo voltado pra projetos de site/landing page. Inclui escopo técnico, entregas, cronograma e cláusula de hospedagem.',
    category: ContractCategory.DESENVOLVIMENTO_SITE,
    variables: COMMON_VARIABLES,
    content: `# CONTRATO DE DESENVOLVIMENTO DE SITE

**Contrato Nº {{numero_contrato}}**

## PARTES

**CLIENTE:** {{nome_cliente}}, CPF/CNPJ {{cpf_cnpj}}, residente em {{endereco_cliente}}, e-mail {{email_cliente}}, telefone {{telefone_cliente}}.

**DESENVOLVEDOR:** {{nome_empresa}}, CNPJ {{cnpj_empresa}}, com sede em {{endereco_empresa}}, e-mail {{email_empresa}}, telefone {{telefone_empresa}}.

## CLÁUSULA 1ª — DO OBJETO

O DESENVOLVEDOR compromete-se a desenvolver para o CLIENTE: {{servico_contratado}}.

## CLÁUSULA 2ª — ESCOPO E ENTREGAS

Estão incluídos no escopo:
- Layout responsivo (desktop, tablet e mobile);
- Otimização básica de SEO on-page;
- Configuração de domínio e hospedagem (caso contratada à parte);
- Treinamento básico de uso do painel administrativo (até 1 hora).

**Não estão incluídos:** redação de conteúdo, criação de logomarca, fotografias profissionais, manutenção mensal pós-entrega, integração com sistemas externos não previstos no escopo inicial.

## CLÁUSULA 3ª — VALOR E PAGAMENTO

O valor total acordado é de **R$ {{valor_proposta}}**, a ser pago da seguinte forma: {{forma_pagamento}}.

## CLÁUSULA 4ª — PRAZO

O projeto será iniciado em {{data_inicio}} e entregue até {{data_vencimento}}, considerando que o CLIENTE forneça os materiais necessários (textos, imagens, acessos) em tempo hábil. Atrasos do CLIENTE postergam o prazo proporcionalmente.

## CLÁUSULA 5ª — REVISÕES

Estão previstas até **3 (três) rodadas de revisão**. Revisões adicionais serão cobradas separadamente conforme tabela vigente.

## CLÁUSULA 6ª — PROPRIEDADE INTELECTUAL

Após o pagamento integral, todos os arquivos finais e direitos sobre o site desenvolvido pertencerão ao CLIENTE. O DESENVOLVEDOR mantém direitos sobre frameworks, bibliotecas e componentes próprios reutilizados.

## CLÁUSULA 7ª — GARANTIA E SUPORTE

Após a entrega, o DESENVOLVEDOR oferece **30 (trinta) dias de garantia** para correção de bugs identificados, sem custo adicional. Solicitações de novas funcionalidades serão tratadas como aditivos contratuais.

## CLÁUSULA 8ª — RESCISÃO

Em caso de rescisão pelo CLIENTE antes da entrega, será cobrado o valor proporcional ao trabalho já executado, mais multa de 30% sobre o valor restante.

## CLÁUSULA 9ª — CONFIDENCIALIDADE E LGPD

Ambas as partes se comprometem a manter sigilo sobre informações trocadas e respeitar a Lei Geral de Proteção de Dados (Lei 13.709/2018).

## CLÁUSULA 10ª — FORO

Fica eleito o foro da comarca de {{endereco_empresa}} para dirimir questões deste contrato.

---

Data: {{data_assinatura}}

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

CLIENTE: {{nome_cliente}}

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

DESENVOLVEDOR: {{nome_empresa}}
`,
  },

  // -----------------------------------------------------------------------
  // 3. CONSULTORIA
  // -----------------------------------------------------------------------
  {
    name: 'Consultoria — Mensal',
    description:
      'Contrato de consultoria recorrente com horas mensais incluídas. Bom pra mentorias, assessoria e advisory.',
    category: ContractCategory.CONSULTORIA,
    variables: COMMON_VARIABLES,
    content: `# CONTRATO DE CONSULTORIA

**Contrato Nº {{numero_contrato}}**

## PARTES

**CONTRATANTE:** {{nome_cliente}}, CPF/CNPJ {{cpf_cnpj}}, endereço {{endereco_cliente}}.

**CONSULTOR:** {{nome_empresa}}, CNPJ {{cnpj_empresa}}, sede {{endereco_empresa}}.

## CLÁUSULA 1ª — DO OBJETO

O CONSULTOR prestará serviços de consultoria especializada ao CONTRATANTE conforme escopo: {{servico_contratado}}.

## CLÁUSULA 2ª — HORAS E AGENDAMENTO

Estão incluídas **até 8 horas de consultoria por mês**, divisíveis em sessões de no mínimo 1 hora, agendadas com antecedência mínima de 48 horas.

Horas não utilizadas no mês não são acumuladas para o mês seguinte.

## CLÁUSULA 3ª — VALOR E PAGAMENTO

O valor mensal é de **R$ {{valor_proposta}}**, com pagamento {{forma_pagamento}}, vencimento todo dia 5 de cada mês.

## CLÁUSULA 4ª — VIGÊNCIA

Contrato vigente de {{data_inicio}} a {{data_vencimento}}, com renovação automática por períodos iguais salvo aviso prévio de 30 dias.

## CLÁUSULA 5ª — CONFIDENCIALIDADE

O CONSULTOR compromete-se a manter sigilo absoluto sobre informações estratégicas, financeiras e comerciais do CONTRATANTE, durante e após a vigência do contrato.

## CLÁUSULA 6ª — RESPONSABILIDADES

O CONSULTOR atua em **regime de meios**, não em **regime de resultados**. Suas recomendações são pareceres técnicos, cabendo ao CONTRATANTE decidir sobre sua implementação.

## CLÁUSULA 7ª — RESCISÃO

Qualquer das partes pode rescindir mediante aviso prévio de 30 dias, sem multa. Rescisão imediata sem aviso prévio implica em multa equivalente a 1 mensalidade.

## CLÁUSULA 8ª — LGPD

As partes se comprometem a respeitar a Lei 13.709/2018 (LGPD) no tratamento de dados pessoais trocados.

## CLÁUSULA 9ª — FORO

Foro da comarca da sede do CONSULTOR.

---

Data: {{data_assinatura}}

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

CONTRATANTE: {{nome_cliente}}

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

CONSULTOR: {{nome_empresa}}
`,
  },
];

// Cláusulas pré-cadastradas pra biblioteca
export const SYSTEM_CLAUSES = [
  {
    title: 'Cláusula de Cancelamento',
    category: 'cancelamento',
    content: `## CLÁUSULA DE CANCELAMENTO

Este contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias. Em caso de rescisão imotivada antes do prazo, será aplicada multa de 20% sobre o valor remanescente do contrato.`,
  },
  {
    title: 'Cláusula de Confidencialidade (NDA)',
    category: 'confidencialidade',
    content: `## CLÁUSULA DE CONFIDENCIALIDADE

Ambas as partes se obrigam, por si e seus colaboradores, a manter sigilo absoluto sobre todas as informações comerciais, técnicas, financeiras e operacionais trocadas durante a execução deste contrato, sob pena de responsabilização civil e criminal cabíveis.`,
  },
  {
    title: 'Cláusula de Multa',
    category: 'multa',
    content: `## CLÁUSULA DE MULTA POR INADIMPLEMENTO

O atraso no pagamento das parcelas acordadas implicará em multa de 2% (dois por cento) sobre o valor devido, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die.`,
  },
  {
    title: 'Cláusula de LGPD',
    category: 'LGPD',
    content: `## CLÁUSULA DE PROTEÇÃO DE DADOS (LGPD)

As partes comprometem-se a tratar os dados pessoais trocados em estrita conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados), garantindo confidencialidade, integridade e finalidade específica para o cumprimento deste contrato.`,
  },
  {
    title: 'Cláusula de Suporte',
    category: 'suporte',
    content: `## CLÁUSULA DE SUPORTE PÓS-ENTREGA

A CONTRATADA oferecerá suporte técnico gratuito por 30 (trinta) dias após a entrega, exclusivamente para correção de defeitos. Solicitações de novas funcionalidades, alterações de escopo ou treinamentos adicionais serão cobrados separadamente.`,
  },
  {
    title: 'Cláusula de Pagamento',
    category: 'pagamento',
    content: `## CLÁUSULA DE PAGAMENTO

O pagamento será efetuado conforme a forma e datas acordadas. Em caso de atraso superior a 15 dias, a CONTRATADA se reserva o direito de suspender a execução dos serviços até a regularização do débito.`,
  },
  {
    title: 'Cláusula de Prazo',
    category: 'prazo',
    content: `## CLÁUSULA DE PRAZO

O prazo de execução será de [X dias] contados a partir do recebimento de todos os materiais necessários enviados pelo CONTRATANTE. Atrasos do CONTRATANTE postergam o prazo final na mesma proporção.`,
  },
  {
    title: 'Cláusula de Entrega',
    category: 'entrega',
    content: `## CLÁUSULA DE ENTREGA E ACEITE

A entrega será considerada efetivada após o envio dos arquivos finais ao e-mail indicado pelo CONTRATANTE. O CONTRATANTE terá 7 (sete) dias úteis para apontar não-conformidades. Não havendo manifestação nesse prazo, considera-se o aceite tácito.`,
  },
];
