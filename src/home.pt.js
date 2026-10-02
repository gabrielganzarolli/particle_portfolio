/**
 * The home page in Portuguese, keyed by the `data-i18n` attribute each element
 * carries in index.html.
 *
 * Kept out of the HTML so index.html stays readable — three of these are full
 * paragraphs, and they would be unreadable crammed into an attribute.
 *
 * The case titles here repeat what cases.pt.js says, because index.html is
 * hand-written and does not go through the generator. If a case is renamed it
 * has to be renamed in both places; the English list has the same problem
 * today, so this does not add one.
 */

export const HOME_PT = {
  title: 'Gabriel Ganzarolli — Product Designer',
  description:
    'Gabriel Ganzarolli — Product Designer em São Paulo, no maior banco da América Latina. Interesse particular em design engineering e filosofia.',

  bio: 'Product Designer em São Paulo, hoje no maior banco da América Latina. Interesse particular em design engineering e filosofia.',

  selectedWork: 'Trabalhos selecionados',
  moreSoon: 'Mais projetos em breve.',

  c1: 'Aquisição Uniclass pelo cartão',
  c2: 'Seleção de Prêmios',
  c3: 'Hub do Aposentado',
  c4: 'Redesenho do caixa eletrônico',
  c5: 'Console do Minhas Vantagens',

  aboutMe: 'Sobre mim',

  lede: 'Sou product designer sênior em São Paulo, no Itaú Unibanco — um dos maiores bancos da América Latina. Sete anos de casa, entre produtos digitais e físicos.',

  about1:
    'Desenho jornadas de alto volume: aquisição de clientes, canais de atendimento e programas de relacionamento. Na prática isso quer dizer abertura de conta e pedido de cartão de crédito, mecânicas de gamification para o programa de relacionamento do banco, e pesquisa sobre as barreiras de acessibilidade que aposentados do INSS encontram ao usar produtos financeiros. Trabalho regulado, com o compliance na sala desde o começo e não no fim.',

  about2:
    'Cheguei às telas vindo dos objetos. Antes do banco eu estava na Klabin desenvolvendo embalagens inteligentes e sustentáveis — IoT, sensores, microcontroladores — e antes disso pesquisava produtos e interfaces ergonômicas no Laboratório de Ergonomia e Interfaces da Unesp, onde me formei em Design de Produto e assinei junto um estudo sobre autoimagem em pessoas que usam próteses de membro inferior. O interesse por acessibilidade começou ali, não no banco.',

  about3:
    'Curso Filosofia na USP em paralelo ao trabalho. O que segura os dois junto é design engineering — a costura onde decisões de interface deixam de ser desenho e viram comportamento.',

  factNow: 'Hoje',
  factNowV: 'Product designer sênior, Itaú Unibanco',
  factBefore: 'Antes',
  factBeforeV: 'Klabin · Laboratório de Ergonomia e Interfaces da Unesp',
  factEdu: 'Formação',
  factEduV: 'Design de Produto, Unesp · Filosofia, USP (em andamento)',
  factLang: 'Idiomas',
  factLangV: 'Português, inglês',

  getInTouch: 'Fale comigo',
};

/**
 * What the particle field spells, per language.
 *
 * The name and the job title are the same in both — "product designer" is what
 * the job is called here too. Only the two navigational words change.
 *
 * These are rasterised to a canvas and sampled, so they are set in capitals and
 * kept short; a long phrase shrinks to fit and the letterforms stop reading as
 * letters.
 */
export const PHRASES = {
  en: ['GABRIEL GANZAROLLI', 'PRODUCT DESIGNER', 'WORK', 'ABOUT ME'],
  pt: ['GABRIEL GANZAROLLI', 'PRODUCT DESIGNER', 'TRABALHOS', 'SOBRE MIM'],
};
