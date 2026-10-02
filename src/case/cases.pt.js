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
    headline: 'O cartão que vieram buscar, a conta que levaram',
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

    outcomes: [
      'Conversão da landing page até o pedido de conta',
      'Conclusão na etapa de retomada da conta no app',
      'Dos perfis recusados no cartão premium aceitaram o Signature',
    ],

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
};
