# Jogo da nave em partículas — design

2026-11-24. Status: rascunho para aprovação.

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

Cada partícula tem um **papel fixo**, definido pelo índice. Valores iniciais,
para ajustar vendo o resultado:

| Papel | Parte do total | Como se forma |
|---|---|---|
| Nave | ~5% | Superfície de uma forma procedural (casco, asas, motor), amostrada no código |
| Anel em volta da nave | ~1,5% | Um anel de partículas, pulsando de leve |
| Meteoritos | ~35% | Cascas irregulares (esfera com ruído), uma por lugar do conjunto |
| Riscos e estrelas | o resto | Fileiras de K pontos (K entre 8 e 16) alinhadas na direção do movimento |

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

### Qualidade e desempenho

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
  fim em `src/homeI18n.js` e `src/home.pt.js`, e o ramo do jogo em
  `src/shaders/simVelocity.frag`.
- Enquanto o jogo roda, o nome, a bio e a cadeia de morphs da rolagem ficam
  desligados.

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
