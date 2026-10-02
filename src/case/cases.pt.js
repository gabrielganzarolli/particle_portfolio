/**
 * The Portuguese prose for each case, keyed by the same slug as cases.js.
 *
 * Only what a reader sees lives here. Everything structural — media files and
 * their placements, outcome figures, years, slugs — stays in cases.js and is
 * merged in at build time, so the two languages cannot drift apart and leave a
 * figure pointing at a chapter that exists in one of them and not the other.
 *
 * A case missing from this file falls back to English, with the build printing
 * which ones. That is how a translation ships one case at a time.
 *
 * On vocabulary: the anglicisms Brazilian product designers actually use are
 * kept — product design, landing page, handoff, cashback, design system. The
 * alternative reads like a translation rather than like someone writing.
 */

export const CASES_PT = {
  'uniclass-card-first-acquisition': {
    title: 'Aquisição Uniclass pelo cartão',
    headline: 'Uma jornada, dois produtos',
    description:
      'Elevar a conversão de abertura de conta no Itaú Uniclass começando pelo cartão de crédito que as pessoas vinham procurar — e segurando os clientes que uma recusa no premium teria perdido.',
    tag: 'Product design',
    discipline: 'Product design',
    role: 'Product designer sênior',
    duration: '3 semanas',

    whatWeDid: [
      'Auditoria da jornada de aquisição existente',
      'Análise de comportamento em sessões reais no FullStory',
      'Facilitação de workshop multidisciplinar de dores e hipóteses',
      'Design de interação e conteúdo na landing, na oferta e na retomada dentro do app',
      'Caminho de oferta alternativa para perfis recusados no cartão premium',
      'Apresentação para a diretoria e handoff para o desenvolvimento',
    ],

    // No outcomes: the case does not carry figures any more.

    overview: [
      'O briefing era aumentar a conversão de abertura de conta no Uniclass, o segmento de renda média do Itaú. A estratégia foi entrar pelo cartão de crédito: o cartão premium era o que as pessoas tinham vindo procurar, a conta era o que o banco precisava que elas levassem. Uma jornada, dois produtos, com uma oferta reserva para quem não passasse na análise do premium.',
      'Auditei a jornada contra o comportamento real — gravações de sessão no FullStory, dados de funil com o product manager e o time de dados — e encontrei três pontos de queda: a landing page, a tela final de oferta e a tela de retomada no app. Os três eram o mesmo erro: o produto descrevendo o processo do banco em vez do motivo que levou o cliente até ali.',
    ],

    takeaways: [
      {
        title: 'Vender o motivo, não o processo',
        body: [
          'O briefing apontava para conversão, o que normalmente quer dizer mexer no formulário. As sessões reais mostravam gente saindo antes disso, antes de decidir que valia a pena começar. Então, em vez de listar benefícios, a página soma eles — um número para o que o cliente economiza por mês, que se abre no cashback, no programa de pontos e na anuidade isenta por trás dele. A promessa vira um valor que dá para conferir. É esse número que o pedido de conta está pedindo para valer.',
        ],
      },
      {
        title: 'Uma recusa que não perde o cliente',
        body: [
          'O cartão alternativo só aparece depois da análise de crédito, então se lê como uma oferta aprovada e não como uma reserva — antes disso, o premium pareceria condicional para todo mundo; depois, o cliente já teria ido embora no momento da recusa. A sequência diz o não uma vez, com todas as letras, e gasta o resto da tela no que o cliente pode ter: o limite, a anuidade isenta, o que isso faz por ele agora. É a clareza sobre o não que torna o sim verossímil.',
        ],
      },
      {
        title: 'A estrutura rendeu mais que o estilo',
        body: [
          'Desenhei versões em todo o espectro, da estética de banco digital à voz tradicional do próprio banco, e apresentei para a diretoria. A conservadora foi a escolhida — e os resultados vieram mesmo assim, o que tornou o argumento indiscutível: o ganho estava na ordem da jornada e na linguagem de cada tela, não no estilo visual. Um refresh sozinho teria entregue os mesmos três pontos de queda numa tipografia mais bonita.',
        ],
      },
    ],

    notes: [
      {
        title: 'Trabalho adjacente',
        body: 'Estudos para a landing page do Personnalité, o segmento de alta renda do banco. Foi a página do Uniclass ter funcionado que ganhou o briefing seguinte, e a mesma abordagem atravessou para outro produto e outro público.',
      },
    ],

    getInTouch: {
      text: 'Quer a versão longa deste aqui? Isso rende uma conversa melhor do que uma página.',
      button: 'Me pergunta sobre isso',
    },

    // Alt text and captions, keyed by file name rather than by position:
    // reordering the media in cases.js then cannot silently reassign a
    // description to the wrong clip.
    media: {
      '02-benefits-carousel.mp4': {
        alt: 'A landing page abrindo com os benefícios do cartão, passando pela conta global, pelo crédito e pelo assistente de IA do banco',
      },
      '01-savings-calculator.mp4': {
        alt: 'O painel de economia, mostrando um total mensal que se abre em cashback, programa de pontos e anuidade isenta',
      },
      '06-decline-to-signature.mp4': {
        alt: 'A sequência de recusa, indo do não até o cartão alternativo e seu limite',
      },
      '05-black-approval.mp4': {
        alt: 'A tela de aprovação do cartão premium, mostrando o limite aprovado',
      },
      '07-personnalite-studies.mp4': {
        alt: 'Estudos para a landing page do Itaú Personnalité',
        caption:
          'De um projeto separado de landing page, para o Itaú Personnalité — briefado logo depois que a página do Uniclass se provou.',
      },
      '03-walkthrough-a.mp4': {
        alt: 'Dois percursos pela mesma landing page em duas direções de design',
        aLabel: 'Versão A',
        bLabel: 'Versão B',
        caption: 'As duas versões foram para teste A/B, com diferenças propositalmente pequenas entre elas.',
      },
    },
  },

  'selecao-de-premios': {
    // The campaign name is the campaign's name — it does not get translated
    // into English either, and the English page already carries it as is.
    title: 'Seleção de Prêmios',
    headline: 'Uma mecânica de prêmio que tinha que parecer banco, não aposta',
    description:
      'Uma mecânica de prêmios da Copa dentro do programa de relacionamento do Itaú: giros semanais e missões feitos para recompensar o cliente, nunca para parecer uma aposta.',
    tag: 'Gamification',
    discipline: 'Product design',
    role: 'Product designer sênior',
    duration: 'Campanha de 12 semanas',

    whatWeDid: [
      'Design da mecânica de jogo com produto, engenharia e o parceiro de sorteio',
      'Pesquisa de gamification sobre o que faz alguém voltar a um jogo',
      'Design de interação do giro semanal, das missões e das jornadas de prêmio',
      'Design de conteúdo junto do jurídico, transformando compliance em linguagem direta',
      'Coordenação entre jurídico, marketing, engenharia e os times de marca',
      'Apresentações para superintendência e diretoria até o lançamento',
    ],

    outcomes: [
      'Clientes inscritos na campanha',
      'Desses, novos no Minhas Vantagens',
      'Giros de prêmio executados',
      'Missões concluídas',
      'Taxa de conversão de adesão à campanha',
      'Chamados de atendimento na campanha inteira — baixo atrito para o volume',
    ],

    overview: [
      'O Itaú fez uma campanha promocional durante a Copa de 2026, construída dentro do Minhas Vantagens e estrelada pelo Ronaldo. Missões semanais davam números da sorte e giros — cadastrar uma chave Pix, conectar o Open Finance, programar pagamentos automáticos, começar a investir.',
      'Isso colocava o cliente em prêmios instantâneos e nos sorteios principais — até um milhão de reais em barras de ouro, uma viagem, um jantar com o Ronaldo. Mais de vinte produtos do banco alimentavam o sistema de missões.',
      'A parte difícil nunca foi a interface. Uma roleta girando com um prêmio dourado é, visualmente, a linguagem do jogo de azar. Isso aqui tinha que se ler como o oposto — um banco recompensando clientes que já eram seus.',
      'Três decisões sustentaram isso: nunca se apostava nada, todo cliente ganhava um número da sorte só por ser cliente, e a linguagem visual ficou perto da voz contida do banco em vez do padrão barulhento da categoria.',
    ],

    takeaways: [
      {
        title: 'Recompensar, nunca apostar',
        body: [
          'A mecânica foi construída de um jeito que o cliente nunca pudesse perder nada. As chances eram ganhas fazendo alguma coisa, nunca compradas nem apostadas. Essa regra fez mais pela confiança do que qualquer tranquilização visual faria, e deixou toda tela mais fácil de escrever: nunca havia uma perda para justificar.',
          'É também por isso que resistimos ao puxão da categoria para o design piscante de jackpot. A contenção custou alguma empolgação e comprou o que importava — o cliente acreditar que o prêmio era real.',
        ],
      },
      {
        title: 'Emprestado de jogos, não de cassinos',
        body: [
          'Estudamos o que faz as pessoas voltarem a um jogo: um ritmo semanal, uma recompensa imediata e uma progressão mais lenta por baixo. Nível no programa significava mais números da sorte, então o cliente antigo via sua relação refletida nas próprias chances.',
          'Lançar para a base inteira de uma vez significava um pico, não uma curva. O que carrega primeiro, o que pode esperar, o que o cliente vê quando algo demora — tudo resolvido com engenharia e marketing antes. A plataforma aguentou. O alcance das comunicações da campanha chegou a 19,7MM, e a adesão veio em cerca de dez vezes o benchmark interno anterior.',
        ],
      },
    ],

    whatMadeItWork: [
      'Reaproveitamos a solução LE3 que já existia para campanhas de parceiros em vez de construir do zero',
      'Dados de missão quase em tempo real via Kafka, o que tornou possível incluir novos tipos de produto no programa',
      'O Platform Evolution Program rodou antes do lançamento para fechar lacunas de resiliência, segurança e escalabilidade',
      'Devin usado para entregas estruturais e correção de bugs',
      'Campanhas multicanal segmentadas e mídia fora do QR puxaram a adesão — a conversão se manteve em todos os caminhos de aquisição',
    ],

    media: {
      '01-main.png': {
        alt: 'Key visual da campanha Seleção de Prêmios — o lockup da promoção e “São experiências e prêmios fenomenais”, com Ronaldo e as cinco estrelas',
      },
      '02-campaign-home.png': {
        alt: 'Home da campanha com o giro disponível, a contagem regressiva para o sorteio final e a explicação do programa',
        caption: 'Home da campanha: o giro que você tem, o sorteio que você está esperando e o que é o programa.',
      },
      '03-spin-and-draws.png': {
        alt: 'O giro de prêmio e a tela que mostra em quais sorteios o cliente está concorrendo',
        caption: 'O giro e os números da sorte já conquistados — chances guardadas, não apostadas.',
      },
      '05-progression.png': {
        alt: 'Nível e progresso no programa, e a próxima atividade recomendada',
        caption: 'Nível no programa e o próximo passo — a progressão lenta por baixo do ciclo semanal.',
      },
      '04-how-it-works.png': {
        alt: 'Como a mecânica funciona, explicada dentro do próprio fluxo, e os sorteios principais',
        caption: 'Como a mecânica funciona e os sorteios que ela alimenta — a campanha explicada dentro do próprio fluxo.',
      },
    },
  },

  'retiree-hub': {
    title: 'Hub do Aposentado',
    headline: 'Um espaço único para os benefícios financeiros',
    description:
      'Um espaço dentro do app do Itaú onde aposentados vinculam e acompanham benefícios do INSS, pensões e auxílios em um lugar só, em vez de espalhados por canais diferentes.',
    tag: 'Banking',
    discipline: 'Product design',
    role: 'Product designer',

    whatWeDid: [
      'Discovery e pesquisa com clientes aposentados',
      'Arquitetura de informação do hub de benefícios',
      'Design de interação para vincular, desvincular e acompanhar status',
      'Design de conteúdo da solicitação e dos seus estados de espera',
      'Prototipação e testes de usabilidade',
      'Handoff e acompanhamento do desenvolvimento',
    ],

    // No outcomes: the case does not carry figures any more.

    overview: [
      'Um espaço dedicado dentro do app do Itaú onde o aposentado vincula e acompanha seus benefícios financeiros em um lugar só. Cliente aposentado costuma equilibrar várias fontes de renda — aposentadoria do INSS, pensão por morte, auxílio por afastamento —, cada uma vivendo num canal diferente, com suas próprias datas e regras. Para um público que valoriza estabilidade acima de tudo, não saber o que entra e quando é uma fonte constante de ansiedade.',
      'Consolidamos tudo numa visão única e clara: navegação simplificada, uma hierarquia visual que se sustenta em diferentes pontos de contato e um caminho fácil para adicionar, consultar e atualizar cada benefício.',
    ],

    takeaways: [
      {
        title: 'Um número que ninguém decorou',
        body: [
          'O fluxo inteiro depende de um número de benefício de dez dígitos impresso num cartão que a maioria das pessoas não olha há anos. Em vez de tratar isso como problema do cliente, escrevemos um passo a passo para achar o número dentro do app do governo, deixamos ele a um toque do campo e permitimos sair e voltar sem perder o que já tinha sido digitado.',
        ],
      },
      {
        title: 'Ninguém tem exatamente um benefício',
        body: [
          'A primeira versão presumia um benefício por pessoa. Os chamados do atendimento diziam o contrário — pensões e aposentadorias se acumulam, muitas vezes entre familiares. Então o seletor virou múltipla escolha, cada cartão carregando o valor do último pagamento e o nome do beneficiário, porque é assim que as pessoas realmente distinguem um benefício do outro.',
        ],
      },
      {
        title: 'Dizer “aguarde” sem perder ninguém',
        body: [
          'O INSS pode levar até quatro meses para responder. Um spinner seria mentira. A linha do tempo de status nomeia cada etapa, data as que já aconteceram e dá um limite honesto para a que ainda não aconteceu — então a resposta para “deu certo?” está na tela, e não numa fila de telefone.',
        ],
      },
    ],

    media: {
      '01-hero.png': { alt: 'O hub de benefícios do INSS dentro do app do Itaú' },
      '06-why-bother.png': {
        alt: 'Os benefícios de vincular e o campo único que inicia a solicitação',
        caption: 'O argumento para vincular um benefício e, em seguida, o campo único que inicia a solicitação.',
      },
      '02-step-by-step.png': {
        alt: 'Tela de detalhe do benefício e o passo a passo para achar o número do benefício no INSS',
        caption: 'Detalhes do benefício e o passo a passo para achar o número no app do governo — a um toque do campo que pede por ele.',
      },
      '03-multi-select.png': {
        alt: 'Seletor de múltiplos benefícios e a linha do tempo do status da solicitação',
        caption: 'Selecionando mais de um benefício de uma vez. Cada cartão traz o último pagamento e o nome do beneficiário — os dois detalhes que as pessoas de fato usam para distinguir seus benefícios.',
      },
    },
  },

  'atm-accessibility': {
    title: 'Redesenho do caixa eletrônico',
    headline: 'Reconstruir o caixa eletrônico e seu design system em torno da acessibilidade',
    description:
      'O redesenho completo da rede de caixas eletrônicos do Itaú e o design system construído para ela, para clientes que não conseguem ler a tela, enxergá-la ou mirar com precisão.',
    tag: 'Design system',
    discipline: 'Product design, design systems',
    role: 'Product designer sênior',
    duration: 'Mais de um ano',

    whatWeDid: [
      'Pesquisa de campo em agências e sessões de laboratório com clientes com deficiência e clientes idosos',
      'Redesenho completo das telas e jornadas do terminal',
      'Um design system construído do zero para o caixa eletrônico',
      'Jornadas de voz desenhadas junto de cada tela',
      'Especificação de acessibilidade para o desenvolvimento',
      'Handoff e acompanhamento durante o desenvolvimento',
    ],

    outcomes: [
      'De aumento no NPS da experiência no caixa eletrônico',
      'Tempo mediano para concluir uma transação',
      'Cada jornada desenhada duas vezes, uma na tela e uma em voz',
    ],

    overview: [
      'O redesenho completo da rede de caixas eletrônicos do Itaú e um design system novo, construído do zero para ela. Um caixa eletrônico é usado em pé, muitas vezes na rua, muitas vezes com pressa — por pessoas com baixa visão, mobilidade reduzida, pessoas que não sabem ler e clientes idosos com uma fila atrás.',
      'O terminal existente tinha virado uma parede de opções de mesmo peso, com a informação importante no menor corpo de texto. O hardware não rodava o leitor de tela que já era padrão em celular. Para um cliente cego não havia caminho acessível nenhum.',
      'Reconstruímos em torno do que a pesquisa de campo mostrou que as pessoas realmente fazem num caixa: elas não leem. Elas se orientam por forma, cor, posição e tato. Então: menos opções por tela, alvos maiores, mais contraste, ícones junto das palavras, as mesmas três saídas sempre no mesmo lugar.',
      'O design system foi herdado do app do banco, para que terminal e celular falassem a mesma língua. E como nenhum leitor de tela existente rodava nas máquinas, o banco construiu a própria camada de áudio — cada jornada desenhada duas vezes, uma na tela e uma como sequência falada.',
    ],

    takeaways: [
      {
        title: 'Ninguém lê num caixa eletrônico',
        body: [
          'Visitas de campo a agências e sessões de laboratório com clientes idosos, clientes cegos, clientes com deficiência motora e clientes que não sabem ler apontaram todas para o mesmo lugar. Ninguém lê uma tela em pé numa máquina com gente esperando atrás. As pessoas varrem por forma, cor e posição, e confirmam com as mãos.',
          'Esse achado decidiu o resto. O texto de apoio que antes carregava a informação importante foi removido, os números que importam ficaram grandes o bastante para conferir de relance, e toda restrição passou a ser dita em palavras em vez de insinuada por um botão desabilitado.',
        ],
      },
      {
        title: 'Complexidade não precisa de mais etapas',
        body: [
          'Dividir limite de crédito entre cartões é a coisa mais complicada que um cliente faz numa dessas máquinas. E cabe numa tela só. Origem à esquerda, destino à direita, limite atual e máximo lado a lado, e um botão de confirmar que fica inativo até existir uma escolha real para confirmar.',
          'A arte do cartão e as bandeiras fazem parte do trabalho, porque o cliente que não consegue ler o nome do cartão ainda o reconhece de vista.',
        ],
      },
      {
        title: 'Um sistema feito para ser construído',
        body: [
          'O design system foi derivado do sistema do app do banco, reaproveitando seus tokens para o terminal não virar uma ilha. O que mudou veio do contexto físico: tamanhos de texto e áreas de toque dimensionados para uma tela vista à distância de um braço, contraste elevado para o reflexo do sol, menos opções por tela. E as mesmas três âncoras se repetem no rodapé de toda tela, para o cliente conseguir sair de qualquer lugar sem procurar.',
          'Os desenvolvedores receberam o sistema e uma especificação de acessibilidade junto, que é a parte que decide se alguma coisa disso sobrevive ao contato com o desenvolvimento.',
        ],
      },
    ],

    whatMadeItWork: [
      'Nenhum leitor de tela existente rodava nas máquinas, então o banco construiu a própria camada de áudio — o cliente ouve e toca, nunca fala',
      'Os desenvolvedores receberam duas especificações por jornada, telas e voz, que é o que tornou possível construir com consistência',
    ],

    media: {
      '02-payment-input.png': {
        alt: 'A tela de valor do pagamento, com teclado na tela e o valor do boleto mostrado como referência',
        caption: 'O valor que está sendo pago fica logo abaixo do campo, então conferir não custa nada.',
      },
      '07-limit-split.png': {
        alt: 'Divisão de limite de crédito entre dois cartões',
        caption: 'Uma tela, uma decisão, com os dois lados da transferência visíveis ao mesmo tempo.',
      },
      '06-spec-spacing.png': {
        alt: 'Espaçamentos anotados na tela de confirmação de pagamento usando os tokens do design system',
        caption: 'Espaçamento anotado em tokens compartilhados, para o terminal e o app medirem do mesmo jeito.',
      },
      '03-date-picker.png': {
        alt: 'Escolha de data de vencimento no fluxo de renegociação',
        caption: 'Datas indisponíveis continuam visíveis em cinza, e a data escolhida é repetida por extenso ao lado do intervalo que a permite.',
      },
    },
  },

  'minhas-vantagens-console': {
    title: 'Console do Minhas Vantagens',
    headline: 'O gerente que precisava perguntar ao cliente',
    description:
      'Um console interno que dá ao gerente de agência do Itaú a mesma visão do programa de relacionamento que o cliente tem, mais os motivos de um nível perdido.',
    tag: 'Product design',
    discipline: 'Product design',
    role: 'Product designer sênior',

    whatWeDid: [
      'Discovery com gerentes de agência para mapear o que eles não conseguiam responder aos clientes',
      'Arquitetura de informação da visão do cliente e do histórico de passos',
      'Design de interação para filtrar o histórico por tipo de evento e data',
      'Design de conteúdo traduzindo as regras do programa em motivos claros para um passo perdido ou ganho',
      'Handoff e acompanhamento do desenvolvimento',
    ],

    outcomes: [
      'Acessos ao histórico de passos, cerca de 2,3 mil por dia',
      'A espera antiga por uma resposta, agora dada na hora na mesa',
      'Horas de atendimento desoneradas em 2026',
    ],

    overview: [
      'Um console interno que mostra ao gerente de agência onde o cliente está no Minhas Vantagens, o programa de relacionamento do banco. Antes dele, o gerente não tinha visão nenhuma do programa: quando o cliente perguntava por que um benefício tinha sumido, o gerente precisava pedir que o próprio cliente explicasse a conta dele.',
    ],

    takeaways: [
      {
        title: 'A pergunta estava apontada para o lado errado',
        body: [
          'Um cliente entra na agência e pergunta o que aconteceu com o nível dele. O gerente é a única pessoa na sala que deveria conseguir responder, e a única informação disponível era o que o cliente conseguisse lembrar. Dar ao gerente a mesma imagem que o cliente vê, mais os motivos por trás dela, era o projeto inteiro.',
        ],
      },
      {
        title: 'Perda é a parte sobre a qual se pergunta',
        body: [
          'Painel de programa costuma mostrar progresso e parar por aí. Esse começa pelo risco: passos perdidos e um aviso quando o cliente está perto de cair de nível. O histórico pode ser filtrado por passos perdidos, mudanças de regra e mudanças de segmento, porque esses são os eventos sobre os quais o cliente chega irritado e os que o gerente nunca conseguia explicar.',
        ],
      },
      {
        title: 'Um programa abstrato precificado em passos',
        body: [
          'Cada produto carrega quanto vale, e os produtos de acúmulo mostram um número contra um limite em vez de uma noção vaga de progresso. Isso transforma um programa de fidelidade numa conversa concreta na mesa: aqui é onde você está, aqui é o que fecha a diferença.',
        ],
      },
    ],

    notes: [
      {
        title: 'Reconhecimento',
        body: 'A plataforma Minhas Vantagens foi vencedora do prêmio Itubers Transformam, no Itaú.',
      },
    ],

    getInTouch: {
      text: 'Quer a versão longa deste aqui? Isso rende uma conversa melhor do que uma página.',
      button: 'Me pergunta sobre isso',
    },
  },
};
