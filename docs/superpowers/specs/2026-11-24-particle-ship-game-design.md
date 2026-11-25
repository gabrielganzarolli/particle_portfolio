# Jogo da nave em partículas — design

2026-11-24. Status: implementado em 2026-11-25 (branch
`claude/godot-game-portfolio-idea-nbss4h`). Aprovado por Gabriel em 2026-11-25, depois de
jogar o protótipo, com a decisão de usar 70 mil partículas (ver "Orçamento de partículas").
Os valores finais e os números da entrega estão no fim de "Protótipo de referência".

## Intenção

Um jogo curto escondido no portfólio, para **impressionar quem avalia o site**
(recrutadores, outros designers e engenheiros). O momento central é este: o
visitante clica no nome, vira a cabeça, clica na cabeça, e as partículas que
formavam o nome e a cabeça se reorganizam numa nave vista de trás, voando por
um campo de meteoritos. O jogo deve parecer a continuação natural do site, não
um jogo encaixado nele.

## Metas

- O jogo é **feito só das partículas do campo existente**. A nave, os
  meteoritos, os riscos de velocidade, o anel e a nota final são partículas.
- **A densidade de partículas faz a transparência**: o que é denso parece sólido
  e o que é ralo parece vidro. Não há malhas, peças invisíveis que bloqueiam o
  fundo, nem nenhum outro truque de oclusão.
- Mesmo vocabulário visual do site: fundo `#07060c`, paleta `white`, soma
  aditiva de luz, bloom, grão e vinheta, a mesma mola e a mesma turbulência.
- Câmera em terceira pessoa, **logo atrás e um pouco acima da nave**, que fica
  no terço inferior da tela, de costas. O ponto de fuga fica no centro, e os
  riscos de luz saem dele (referência: o hiperespaço de um jogo de naves
  mostrado por Gabriel).
- A entrada reaproveita as partículas: cada uma voa do seu lugar na cabeça
  para o seu papel no jogo, com a dispersão e a mola de hoje.
- **Nada muda para quem nunca clica na cabeça**: mesmo peso de carregamento,
  mesmo desempenho do herói.

## Não-metas

- Godot, ou qualquer engine. Foi considerado e descartado (ver Abordagens).
- Voo livre com giro e pitch. É um corredor.
- Som, placar online, power-ups, vários níveis, giroscópio.
- Painel de informações durante a partida.
- Modelos 3D externos ou qualquer arquivo novo de asset.

## Anti-metas (falha mesmo que funcione)

- Parecer um jogo colado: cores novas, interface nova, sólidos, fonte diferente.
- Deixar o herói mais lento ou o site mais pesado para quem não joga.
- Um jogo que só roda bem na máquina de quem fez.
- Uma saída que não funciona no celular.

## Restrições (o que o código de hoje impõe)

- O campo é uma simulação na GPU: 512² = 262.144 partículas no nível 3, 384² =
  147.456 no 2, 256² = 65.536 no 1 (`src/quality.js`). Posição e velocidade
  ficam em texturas; cada partícula persegue um destino por mola
  (`src/shaders/simVelocity.frag`).
- Os destinos de hoje são texturas montadas na CPU (`buildTarget`, por volta de
  90 ms por frase). Enviar 262 mil posições por quadro seria pesado (cerca de
  4 MB por quadro), então o destino do jogo é **calculado no shader** a partir
  de uma lista curta de objetos.
- A mola de hoje assenta em ~0,8 s e a velocidade máxima é 10 unidades/s. Isso
  serve para letras e não serve para uma nave nem para meteoritos rápidos.
- O desenho é de pontos redondos, aditivos, sem teste de profundidade. O
  tamanho segue a perspectiva e o desfoque por profundidade já existe.
- A cena de hoje é plana (±0,16 de profundidade) com a câmera olhando de frente.
- Clicar no nome vira a cabeça e clicar na cabeça volta ao nome
  (`toggleHead`, `src/main.js:368`).
- `prefers-reduced-motion` é respeitado em todo o site.
- Não há testes no projeto. O site é estático, hospedado na Vercel.

## Abordagens consideradas

1. **Godot completo**, com visual de partículas no estilo do site. É Godot de
   verdade, mas o jogo ficaria em outro canvas, a transição seria um truque de
   edição, o peso seria de 8 a 10 MB e no celular iniciaria devagar.
2. **Godot só como lógica**, com as partículas do site desenhando tudo. Carrega
   um engine inteiro para calcular posições que o JavaScript calcula em poucas
   linhas.
3. **Tudo em Three.js, no mesmo sistema de partículas.** A transição do nome
   para o jogo acontece de verdade, o carregamento é quase nulo e o resultado é
   o mais coerente com o site.

**Escolhida: 3**, por Gabriel. O motivo é que a magia do projeto é "as
partículas do meu nome viram o jogo", e isso só é real nesta abordagem.

## O design

### Fluxo

```
nome ──clique──▶ cabeça ──clique na cabeça──▶ JOGO ──bater──▶ explosão
 ▲                 │                           ▲                │
 └──clique fora────┘                           │                ▼
                                          clique: de novo   tempo em partículas
                                               Esc / ×: volta ao nome
```

- Clicar na **cabeça** inicia o jogo. Sem aviso: o cursor já vira mãozinha
  sobre a cabeça.
- *(Escolha minha)* Clicar **fora da cabeça**, quando ela está formada, volta
  ao nome. Sem isso, a única volta da cabeça ao nome passaria pelo jogo.
- Ao bater: a nave explode, o tempo sobrevivido se forma em partículas com a
  fonte do nome, e **um clique joga de novo na hora**. `Esc` volta ao nome.
- *(Escolha minha)* Para sair no celular há um botão "×" no mesmo estilo do
  botão de idioma que já existe. É o único elemento que não é partícula.
- Quem tem movimento reduzido não vê o jogo: a cabeça funciona como hoje.
- *(Escolha minha)* Durante a explosão e a formação do tempo (~1,2 s mais o
  tempo da formação) o clique é ignorado. Ele só vale depois que o tempo
  terminou de se formar, para o jogador não reiniciar sem ver a nota.

### O mundo

- A nave voa para frente. Em termos práticos, a nave fica parada na origem e o
  mundo corre na direção da câmera.
- A nave se move dentro de um corredor retangular (esquerda/direita e
  cima/baixo), cujas dimensões acompanham a proporção da tela. Ela se inclina
  conforme a velocidade lateral.
- Controles: o mouse ou o dedo definem a posição-alvo, e a nave a segue com
  uma mola firme. No teclado, setas ou A/D/W/S movem o alvo.
- A câmera acompanha a nave com um pequeno atraso e abre um pouco o campo de
  visão conforme a velocidade sobe.
- Meteoritos vêm do fundo, a partir de um conjunto reaproveitado de uns 12
  lugares (valor inicial para ajustar), com posições sorteadas dentro do
  corredor e um pouco além dele.
- A velocidade e a densidade dos meteoritos sobem com o tempo. A nota é o
  tempo sobrevivido em segundos, com uma casa decimal.
- Colisão: esferas (a nave com duas ou três, cada meteorito com uma), em
  JavaScript. Um toque termina a partida.
- *(Escolha minha)* Sem painel durante a partida. O tempo só aparece no fim.

### As partículas

**Orçamento de partículas (decisão de Gabriel).** O jogo usa **70 mil partículas
ativas** no nível 3, o valor com que o protótipo foi aprovado. A aparência
depende da densidade: com as 262 mil do campo inteiro, as mesmas formas ficariam
3,7 vezes mais densas e estourariam em branco. As demais partículas do campo
ficam estacionadas e invisíveis (brilho zero) enquanto o jogo roda, e o campo do
herói continua com 512². *(Escolha minha)* Nível 2: 40 mil. Nível 1: 25 mil.

Cada partícula tem um **papel fixo**, definido pelo índice. As proporções
abaixo são as do protótipo aprovado, sobre o orçamento do jogo:

| Papel | Parte do orçamento | Como se forma |
|---|---|---|
| Nave | ~12% (cerca de 14% disso é chama dos motores) | Superfície de uma forma procedural (casco, asas, motor), amostrada no código |
| Anel em volta da nave | ~3,5% | Elipse de partículas no plano do chão, com preenchimento ralo |
| Meteoritos | ~43% | Cascas irregulares (esfera com ruído), 10 lugares reaproveitados |
| Riscos e estrelas | o resto (~41%) | Fileiras de K = 10 pontos alinhadas na direção do movimento |

- **Densidade como transparência.** O casco e o motor têm mais partículas por
  área, as asas têm menos e a borda das asas é mais densa. O lado que a câmera
  não vê tem pouquíssimas. Os riscos são fileiras de pontos: poucas fileiras
  parecem vidro, muitas parecem uma parede de luz. O desfoque por profundidade
  que já existe faz os meteoritos distantes parecerem brilhos suaves que ficam
  nítidos ao se aproximar.
- **Mola por papel.** A nave tem mola firme (~7 vezes a de hoje, atraso de uns
  0,13 s). Os meteoritos têm mola média, o que dá rastro. Os riscos seguem o
  destino quase direto. A velocidade máxima sobe no modo jogo.
- **O destino é calculado no shader** a partir de uma lista curta enviada por
  `uniform`: posição, tamanho e rotação de cada objeto, mais a posição e a
  inclinação da nave. O deslocamento de cada partícula dentro do seu objeto é
  fixo e fica numa textura pequena criada uma vez.
- **Entrada e saída.** Ao entrar, o destino de cada partícula passa da cabeça
  para o papel dela, no morph que já existe. Ao explodir, a nave recebe um
  impulso para fora e perde o destino por cerca de 1,2 s. Em seguida o campo
  inteiro se forma no tempo escrito, e depois volta ao nome pelo mesmo
  caminho.
- O texto da nota é montado enquanto a nave explode, em fatias entre os
  quadros (`buildTargetInSlices`), para não travar. Usa o idioma da página.

### Referência visual

Gabriel mostrou uma captura de um jogo de naves no hiperespaço. A imagem não
vai para o repositório (é de terceiros); o que vale dela está aqui.

- **Câmera:** baixa e atrás da nave, levemente acima. A nave ocupa o terço
  inferior, de costas, com cerca de um quarto da altura da tela.
- **Ponto de fuga** no centro, um pouco acima da nave, com um núcleo muito
  brilhante.
- **Riscos de velocidade:** linhas finas e longas, radiais a partir do ponto de
  fuga. Os mais próximos da borda são mais longos e mais brilhantes, e os
  próximos do centro são curtos e fracos. Há poucos riscos grossos e muitos
  finos, e entre eles ficam pontos soltos, que são as estrelas.
- **Anel translúcido** em volta da nave, como uma bolha, e luz forte nos
  motores sobre o casco escuro.
- Da referência **não** se copia: o azul, as franjas de cor nas pontas dos
  riscos e o painel de informações. O site fica em branco frio.

Em partículas: cada risco é uma fileira de pontos cuja distância entre pontos e
cujo comprimento crescem com a velocidade e com a distância ao centro. As
estrelas são pontos isolados com a mesma regra de movimento.

### Qualidade e desempenho

**Meta de desempenho (confirmada por Gabriel):**
60 quadros por segundo no nível 3 em computador, e no mínimo 30 estáveis nos
níveis 1 e 2 num celular intermediário. Se uma máquina não alcança isso, o
nível cai **entre partidas**, nunca no meio de uma. O que se corta primeiro: o
bloom (que o nível 1 já dispensa), depois os pontos por risco e as estrelas.
A forma da nave e dos meteoritos é o que se preserva por último.

- O número de lugares de meteoritos, de partículas por objeto e de pontos por
  risco **escala com o nível de qualidade**. No nível 1 sobram só 65 mil.
- O jogo é carregado sob demanda, com `import()`, no primeiro clique na cabeça.
- O custo extra no shader do herói precisa ser desprezível. O cálculo do
  destino do jogo só roda quando o modo jogo está ativo.
- O medidor de quadros que rebaixa o nível não deve agir durante a partida.

### Integração

- Código novo em `src/game/` (lógica, formas, destino em shader).
- Pontos de contato com o resto: um estado de jogo no loop de `main.js`, a
  rolagem travada enquanto joga e a rolagem restaurada ao sair, os textos do
  fim em `src/homeI18n.js` e `src/home.pt.js`, e o ramo do jogo, que no fim
  ficou em variantes dos shaders do herói (`src/game/shaders`, montadas e
  compiladas só na primeira partida) para que `src/shaders` continue igual ao
  de `main`.
- Enquanto o jogo roda, o nome, a bio e a cadeia de morphs da rolagem ficam
  desligados.

## Protótipo de referência

`docs/superpowers/specs/2026-11-24-particle-ship-game-prototype.html` é o
protótipo que Gabriel jogou e aprovou. **É descartável e não é o código
final**: roda em CPU, tem o próprio sistema de partículas e pula a etapa da
cabeça. Serve para o construtor ler os valores calibrados e ver o visual
esperado. Valores de partida que ele usa:

- Corredor: ±3,2 de largura e ±1,7 de altura. A nave segue o ponteiro com mola
  (k = 45, amortecimento próximo do crítico) e inclina até ~0,65 rad conforme a
  velocidade lateral.
- Câmera: em (0,55·x da nave; 1,35 + 0,45·y; 4,6), olhando para
  (0,35·x; 0,15 + 0,3·y; −30). Campo de visão de 58° a 66° conforme a velocidade.
- Velocidade do mundo: 14 unidades/s, subindo 0,45/s até 38.
- Colisão: quatro esferas na nave, (0; 0; −0,6; r 0,3), (0; 0; 0,2; r 0,42) e
  (±0,9; 0; 0,4; r 0,3), contra uma esfera por meteorito (raio 0,5 a 1,45, com
  80% do raio na colisão). 45% dos meteoritos nascem mirando na nave. Nada
  colide nos primeiros 2,2 s.
- Molas por papel: nave 70, anel 40, meteoritos 18, riscos 30, com
  realimentação da velocidade do destino, para que o que se move em linha reta
  não fique para trás.
- Os riscos e os meteoritos que reaparecem **saltam** para o novo destino, em
  vez de voar até ele.
- Desfoque por profundidade bem mais fraco que o do herói, e o brilho de pontos
  menores que um pixel só é compensado pela metade. Sem isso, meteoritos e
  riscos distantes somem.

### Valores finais no site (ajuste da Tarefa 12)

Os valores acima do protótipo valem no site, com estes acréscimos e ajustes
(constantes em `src/game/shaders/points.vert`, `src/game/gpu.js`,
`src/game/shaders/simVelocity.frag` e `src/game/index.js`):

- Partículas ativas: 70 000 (nível 3), 40 000 (nível 2), 24 995 (nível 1,
  arredondado para riscos inteiros de 10 pontos).
- Aparência por papel, como no protótipo: profundidade de campo 0,011; ponto
  mínimo de 1,15 px CSS vezes a densidade de pixels da tela; alfa 0,8; a
  intensidade do protótipo (espaço de exibição) vai para luz linear com
  expoente 1,8 e é dividida pela opacidade base do herói (`uOpacity`, 0,52).
  A compensação de pontos menores que o mínimo é a razão dos diâmetros (não
  das áreas), aplicada antes da curva. Meteoritos surgem entre z −112 e −88;
  riscos entre −112 e −85 (os dois valores são os do protótipo).
- Sem bloom (nível 1), os pontos do jogo são 1,7× maiores e mais brilhantes
  (no nível 2, com bloom 0,75, 1,175×). Medido na captura do `look` em t = 8 s:
  pixels acesos 2,47% / 5,63% / 6,30% e quase brancos 0,20% / 0,20% / 0,21%
  nos níveis 1, 2 e 3; o `look` falha acima de 0,5% de quase branco.
- Velocidade máxima das partículas: 120 u/s enquanto o par de morph inclui o
  jogo (a do herói é 10 u/s).
- Nota: morph de 1,2 s com a aterrissagem firme do herói (`snap` = 1); o
  clique para jogar de novo só vale 1,5 s depois do fim do morph (e nunca
  antes de 1,7 s em SCORE). Medido no software (nível 1): no instante em que o
  clique passa a valer, ~99% das partículas estão a menos de 0,15 do seu lugar
  no texto (antes do ajuste: 0%, a 90 unidades, porque as do fundo do
  corredor vinham a 10 u/s e levavam ~10 s).

### Números da entrega

- **Custo do herói:** os programas do herói são idênticos aos de `main`; os do
  jogo são compilados só na primeira partida. `bench` (6 rodadas alternadas,
  `#nivel1`, renderização por software): 81,55 ms contra 80,63 ms por quadro,
  razão 1,011, veredito INCONCLUSIVE (saída 3) só porque a dispersão de `main`
  (9,7%) passa da margem; a branch foi mais lenta em 4 de 6 pares.
- **Bundle:** o *chunk* principal tem 600 205 B, +5,3 KB brutos / +1,7 KB gzip
  sobre `main` (594 903 B), pela API de jogo do `ParticleField` e pelos
  ganchos do `main.js` (+16 B da divisão em *chunk* sob demanda, mais 19 B do
  ajuste final). O *chunk* do jogo, baixado só no primeiro clique na cabeça,
  tem 30,3 KB (12,6 KB gzip; 28,6 KB / 12,1 KB antes do ajuste final, que
  acrescentou constantes e comentários aos shaders).
- **Primeira partida:** montar e compilar os três programas do jogo leva ~18 ms
  de compilação por software (19 ms no nível 3); com o laço do site rodando
  ao mesmo tempo, a espera do primeiro `start` foi de 217 ms (nível 1) e
  573 ms (nível 3), porque os quadros por software são lentos.
- **A taxa de quadros real só se mede no computador do Gabriel.**

## Verificação

- Funções puras (colisão, sorteio de meteoritos, mapa de papéis por índice)
  são testadas com o executor de testes nativo do Node, sem dependência nova.
- A parte visual é conferida com um navegador sem interface e capturas de tela
  nos três níveis (`#nivel1`, `#nivel2`, `#nivel3`).
- **A taxa de quadros real só se mede no computador do Gabriel.** O navegador
  sem interface usa renderização por software, que é lenta.

## O que fica para quem constrói

- Proporções finais de cada papel, K dos riscos, número de lugares de
  meteoritos, curva de dificuldade, tamanho do corredor, campo de visão.
- A forma exata da nave e dos meteoritos, dentro das regras de densidade.
- Valores de mola e de velocidade máxima por papel.
- Como organizar o ramo do shader, se no mesmo material ou num segundo.
- Detalhes do movimento reduzido no celular.

## Escolhas minhas, para conferir

1. Clicar fora da cabeça volta ao nome.
2. Botão "×" no celular, único elemento que não é partícula.
3. Sem painel durante a partida; o tempo só aparece no fim.
4. Um clique joga de novo; `Esc` volta ao nome.
5. Branco frio, sem tom azul e sem franjas de cor.
6. Corredor, e não voo livre.
7. Os números iniciais de partículas, meteoritos e dificuldade.
8. Cliques são ignorados até o tempo terminar de se formar.
9. Se a máquina é lenta, o nível cai entre partidas, nunca durante uma.
10. Nos níveis 2 e 1, o jogo usa 40 mil e 25 mil partículas.
