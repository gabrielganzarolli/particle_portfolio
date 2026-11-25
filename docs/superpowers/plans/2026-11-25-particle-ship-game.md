# Jogo da nave em partículas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar na cabeça no hero faz as partículas do campo virarem uma nave vista de trás, desviando de meteoritos, com explosão, tempo final escrito em partículas e volta ao nome.

**Architecture:** A lógica do jogo é JavaScript puro e testável em `src/game/` (mundo, controles, câmera, fases). A aparência roda dentro do campo de partículas que já existe: o jogo vira um "destino virtual" calculado no shader a partir de uma lista curta de uniforms, e as partículas o perseguem com a mola do site. O módulo do jogo é carregado com `import()` no primeiro clique na cabeça.

**Tech Stack:** Three.js 0.185, GLSL (GPUComputationRenderer), Vite 8, executor de testes nativo do Node 22 (`node --test`), Playwright global só para conferência visual (não vira dependência).

**Spec:** `docs/superpowers/specs/2026-11-24-particle-ship-game-design.md`. **Protótipo de referência (descartável, CPU):** `docs/superpowers/specs/2026-11-24-particle-ship-game-prototype.html`. Ele é a especificação executável da forma, das proporções, da câmera e dos valores de mola: onde este plano diz "portar do protótipo", o algoritmo está lá (`shipPoint`, `fuselage`, `evalGoal`, `updateCamera`, vertex shader `VS`).

## Global Constraints

- **70 mil partículas ativas** no nível 3, **40 mil** no nível 2, **25 mil** no nível 1. As demais partículas do campo ficam estacionadas e invisíveis; o campo do herói continua 512² (`src/quality.js`).
- Só partículas: **sem malhas, sem peças invisíveis que bloqueiam o fundo**. Densidade faz a transparência. Fundo `#07060c`, paleta `white`, soma aditiva, bloom, grão e vinheta do site, a mesma mola e turbulência.
- Nada muda para quem nunca clica na cabeça: o jogo entra por `import()` e o custo extra no shader do herói é desprezível (ramo do jogo só roda quando um dos extremos do morph é o jogo).
- `prefers-reduced-motion`: o jogo não existe; a cabeça funciona como hoje.
- O nível de qualidade só cai **entre partidas**, nunca no meio de uma. Meta: 60 fps no nível 3 em computador; no mínimo 30 estáveis nos níveis 1 e 2 num celular intermediário.
- Único elemento DOM novo: botão "×" no estilo do botão de idioma. Sem som, sem painel durante a partida; o tempo só aparece no fim, com a fonte do nome (Archivo 800), no idioma da página (vírgula decimal em PT, ponto em EN).
- Sem dependência nova. Comentários e identificadores em inglês, como no repositório; textos para o visitante nos dois idiomas.
- Todo o trabalho fica na branch `claude/godot-game-portfolio-idea-nbss4h`; um commit por tarefa.

## Review Focus

O design é uma visão; estes casos ele não menciona e quebrariam a experiência. Cada um tem teste na tarefa dona do código.

1. **Atravessar o meteorito.** Em 38 u/s com quadro lento (dt de 0,05 s) o meteorito anda ~1,9 u por passo, mais que o diâmetro de colisão dos pequenos: um teste só de ponto deixa a nave passar. A colisão precisa varrer o trecho do passo. (Tarefa 3)
2. **Tecla presa.** O visitante troca de aba ou clica fora com a seta apertada, o `keyup` nunca chega e a nave voa para sempre para um lado. Perder o foco solta todas as teclas. (Tarefa 4)
3. **Troca de idioma durante a partida.** O botão de idioma dispara a re-formação das frases e brigaria com o morph do jogo. Durante o jogo o botão some e o gancho ignora a troca. (Tarefas 9 e 10)
4. **Redimensionar ou girar o celular no meio da partida.** O campo de visão do jogo é diferente do hero, e a escala de pontos precisa seguir o campo de visão atual. (Tarefas 9 e 10)
5. **Apertar tudo ao mesmo tempo.** `Esc` durante a explosão, clique durante a formação da nota, dois cliques seguidos ou `Esc` duas vezes não podem reiniciar sem ver a nota, travar o estado nem deixar o herói quebrado depois. (Tarefa 5)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/game/rng.js` | RNG com semente (para testes e formas reproduzíveis) |
| `src/game/budget.js` | Orçamento de partículas por nível e por papel |
| `src/game/shapes.js` | Textura de offsets locais: nave, chama, anel, meteoritos |
| `src/game/world.js` | Mundo, nave, meteoritos, dificuldade, colisão, uniforms |
| `src/game/controls.js` | Direção da nave (teclado e ponteiro) e ligação com o DOM |
| `src/game/camera.js` | Câmera de perseguição e mistura com a do herói |
| `src/game/phases.js` | Máquina de fases (entrar, jogar, morrer, nota, sair) |
| `src/game/clickRules.js` | Decide o que um clique no hero faz |
| `src/game/text.js` | Tempo formatado e rótulo do botão, por idioma |
| `src/game/index.js` | `createGame(ctx)`: junta tudo; é o módulo carregado sob demanda |
| `src/shaders/lib/game.glsl` | Destino do jogo por partícula (compartilhado pelos shaders de velocidade e posição) |
| `src/ParticleField.js`, `simVelocity.frag`, `simPosition.frag`, `points.vert` | Ganchos do jogo no campo |
| `src/main.js`, `index.html`, `src/styles.css` | Entrada, loop, bloqueio de rolagem, botão "×" |
| `scripts/game-check.cjs` | Conferências no navegador (posições, visual, fluxo, custo do herói) |
| `package.json` | Script `test` |

---

### Task 1: Executor de testes, RNG e orçamento

**Files:**
- Create: `src/game/rng.js`, `src/game/budget.js`, `src/game/budget.test.js`
- Modify: `package.json` (script `"test": "node --test \"src/game/**/*.test.js\""`; com um diretório como argumento o Node 22 não roda nenhum teste, então o padrão com glob é obrigatório)

**Interfaces:**
- Produces: `createRng(seed: number): () => number` (mulberry32, [0,1)); `SLOTS = 10`, `STREAK_POINTS = 10`, `LEVEL_ACTIVE = {1:25000, 2:40000, 3:70000}`; `gameBudget(level: 1|2|3): Budget` com `Budget = { active, flame, shipEnd, ringEnd, meteorEnd, perMeteor, streakCount }` (índices acumulados: chama `[0,flame)`, casco `[flame,shipEnd)`, anel `[shipEnd,ringEnd)`, meteoritos `[ringEnd,meteorEnd)`, riscos `[meteorEnd,active)`).

- [ ] **Step 1: Escrever `budget.test.js`.** `gameBudget(3)` deve ser exatamente `{ active: 70000, flame: 1176, shipEnd: 8400, ringEnd: 10850, perMeteor: 3010, meteorEnd: 40950, streakCount: 2905 }`. Para os níveis 1, 2 e 3: `active` igual a `LEVEL_ACTIVE[level]` (tolerância de até 9 a menos nos níveis 1 e 2 por causa do arredondamento em grupos de 10), `(active - meteorEnd) === streakCount * STREAK_POINTS`, e `active` cabe no campo (`<= 256², 384², 512²`). Teste de `createRng`: mesma semente, mesma sequência; valores em [0,1).
- [ ] **Step 2: Rodar `npm test`.** Esperado: FALHA (módulos inexistentes).
- [ ] **Step 3: Implementar `createRng` e `gameBudget`.** Proporções do protótipo sobre o orçamento: nave 12% (chama = 14% da nave, arredondado para baixo), anel 3,5%, 10 lugares de meteorito com 43% no total (`perMeteor = floor(n * 0.43 / SLOTS)`), riscos o resto, truncado a múltiplos de `STREAK_POINTS`; `active` é a soma real.
- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** — `git add package.json src/game && git commit -m "game: test runner, seeded rng and particle budget"`.

---

### Task 2: Formas locais da nave, do anel e dos meteoritos

**Files:**
- Create: `src/game/shapes.js`, `src/game/shapes.test.js`

**Interfaces:**
- Consumes: `Budget`, `createRng`.
- Produces: `buildGameLocal(budget: Budget, grid: number, rng: () => number): Float32Array` de tamanho `grid*grid*4` (RGBA por partícula: `xyz` offset local, `w` brilho-base); `sampleFuselage(rng): {x,y,z,w,u}` exportada para teste.

- [ ] **Step 1: Escrever `shapes.test.js`** com o orçamento do nível 3 e semente fixa:
  - `deterministic`: duas chamadas com a mesma semente dão arrays idênticos; sem `NaN`.
  - `hull stays inside the ship envelope`: nos índices do casco, `x ∈ [-1.6, 1.6]`, `y ∈ [-0.3, 0.8]`, `z ∈ [-1.31, 1.17]`.
  - `fuselage keeps fewer points on faces turned away from the camera`: com 40.000 chamadas de `sampleFuselage`, a densidade por unidade de `u` em `u < 0.3` é menor que 0,5 da densidade em `u > 0.7` (o protótipo dá ~0,32).
  - `wings are sparse and their rims dense`: no casco, a fração com `w ≈ 0.95` (borda) fica em 0,12 ± 0,03, e a fração com `w ∈ [0.3, 0.5]` (asa) em 0,24 ± 0,04.
  - `engine caps are the brightest`: a fração com `w ≈ 1.5` fica em 0,045 ± 0,015.
  - `meteors`: para os índices de meteoritos, `|xyz|` está em `[0, 1.4]`, e entre 10% e 30% dos pontos têm `w ≈ 0.3` (interior); `ring`: `y ≈ -0.42` e `w ≈ 0.5` ou `w ≈ 0.14`.
  - **Todas as comparações de valores lidos do array usam tolerância (`< 1e-5`), nunca `===`:** o array é `Float32Array`, que não guarda 0,95, 0,3 nem -0,42 exatamente.
  - `flame and streak indices carry no offsets`: `xyz` zero; chama com `w = 1`.
- [ ] **Step 2: Rodar `npm test`.** Esperado: FALHA.
- [ ] **Step 3: Implementar `buildGameLocal`** portando do protótipo `shipPoint`, `fuselage`, `tri` e o anel e os meteoritos de `build()` (ruído de valor para o raio, 22% de pontos internos). O ruído de valor entra como função local, sem dependência.
- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** — `game: procedural ship, ring and meteor shapes`.

---

### Task 3: O mundo — nave, meteoritos, dificuldade e colisão

**Files:**
- Create: `src/game/world.js`, `src/game/world.test.js`

**Interfaces:**
- Consumes: `createRng`, `SLOTS`.
- Produces: `CORRIDOR = { halfW: 3.2, halfH: 1.7 }`, `LOOP = 120`; `speedTarget(t: number): number`; `createWorld(rng): World`; `stepWorld(world: World, dt: number, target: {x: number, y: number}, opts?: {collide?: boolean}): void`; `shipSpheres(ship): {x,y,z,r}[]`; `sweptHit(ship, meteor): boolean`; `gameUniforms(world): GameUniforms`.
  `World = { t, speed, distance, alive, ship: {x,y,vx,vy,bank}, meteors: {x,y,z,R,spin,angle,prevZ}[] }`.
  `GameUniforms = { ship: Float32Array(4) /* x,y,vx,vy */, shipRot: Float32Array(2) /* cos,sin do bank */, meteors: Float32Array(SLOTS*4) /* x,y,z,R */, meteorRot: Float32Array(SLOTS*2) /* cos,sin */, speed, distance /* world.distance % LOOP */, alive: 0|1 }`.

- [ ] **Step 1: Escrever `world.test.js`** (semente fixa):
  - `speedTarget`: `14` em `t=0`; `23` em `t=20`; `38` em `t=60` e em `t=1000`.
  - `speed eases toward the target`: depois de 10 s de passos de 1/60 s, `|world.speed - speedTarget(10)| < 0.6`; começa em 4.
  - `ship follows the target with a critically damped spring`: alvo (2, 1) por 2 s: `|ship.x - 2| < 0.05`, `|ship.y - 1| < 0.05`, sem passar do alvo por mais de 0,1; `bank` tem sinal oposto ao de `vx` e `|bank| ≤ 0.65`.
  - `ship target is clamped to the corridor`: alvo (99, -99) termina em `x ≤ 3.2`, `y ≥ -1.7`.
  - `no collisions in the first 2.2 s`: um meteorito posto em cima da nave não mata antes de `t = 2.2`; depois mata (`alive === false`).
  - `collision spheres`: a nave tem as esferas `(0,0,-0.6,r.3)`, `(0,0,0.2,r.42)`, `(±0.9,0,0.4,r.3)`; um meteorito de `R = 1` a 0,5 de distância lateral do centro colide; a 2,5 não. O raio de colisão do meteorito é `0.8·R`.
  - `a small fast meteor does not tunnel` (Review Focus 1): `R = 0.5`, `speed = 38`, `dt = 0.05`, meteorito vindo de `z = -3` com deslocamento lateral `y = 0.6` em relação à nave: `sweptHit` retorna `true` em algum passo, e um teste de ponto em cada passo nunca acerta. (O deslocamento é necessário: um meteorito exatamente no centro tem janela de contato de ~2,3 u, maior que o passo de 1,9 u, e um teste de ponto também o pegaria; o teste de ponto só deixa passar perto da borda.)
  - `meteors respawn at the far end after passing the camera`: `z > 9` volta a `z ∈ [-134, -112]`; 45% dos nascimentos (entre 0,40 e 0,50 em 2.000 sorteios) miram a nave (`|x - ship.x| ≤ 0.9` **e** `|y - ship.y| ≤ 0.7`; só em x, cerca de 20% dos sorteios aleatórios também cairiam na faixa e a fração mediria ~0,57).
  - `initial meteors start far`: `z ≤ -55` e nenhum alcança `z > -3` em menos de 3 s.
  - `dt is clamped to 0.05`: um passo de dt = 5 anda o mesmo que um de 0,05.
  - `gameUniforms`: `distance === world.distance % 120`; `meteors[4*i..]` igual a `x,y,z,R` do meteorito `i`; `alive` 1 ou 0.
- [ ] **Step 2: Rodar `npm test`.** Esperado: FALHA.
- [ ] **Step 3: Implementar `world.js`.** Valores: velocidade-alvo `min(14 + 0.45 t, 38)` com suavização `v += (alvo - v) * min(1, dt * 1.4)`; mola da nave `k = 45`, amortecimento `2√k·0.92`; `bank` suavizado `(clamp(-vx·0.085, ±0.65) - bank) · min(1, dt·8)`; colisão a partir de `t > 2.2`; nascimento inicial `z = -(55 + s·11 + rnd·6)`, depois `-(112 + rnd·22)`; meteorito `R ∈ [0.5, 1.45]`, giro `±0.65 rad/s`. `sweptHit` testa, por esfera, o intervalo de `z` do passo (`prevZ → z`) contra o intervalo de contato `[sz − √(rr²−lat²), sz + √(rr²−lat²)]`.
- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** — `game: world simulation with swept collision`.

---

### Task 4: Controles e câmera (funções puras)

**Files:**
- Create: `src/game/controls.js`, `src/game/camera.js`, `src/game/controls.test.js`, `src/game/camera.test.js`

**Interfaces:**
- Consumes: `CORRIDOR`.
- Produces: `steerTarget(state: {tx,ty}, input: {kx: -1|0|1, ky: -1|0|1, pointer: {x,y}|null}, dt: number): void`; `createKeyState(): {set(key: string, down: boolean): void, releaseAll(): void, read(): {kx, ky}}`; `attachControls(win: Window): {read(): {kx, ky, pointer: {x,y}|null}, dispose(): void}`; `gameCamera(ship: {x,y}, speed: number): {px,py,pz,tx,ty,tz,fov}`; `blendPose(hero: Pose, game: Pose, e: number): Pose`; `stepBlend(blend: number, target: 0|1, dt: number): number`; `HERO_FOV = 50`.

- [ ] **Step 1: Escrever os testes.**
  - `controls`: teclado move o alvo `5 u/s` na horizontal e `4 u/s` na vertical e respeita o corredor; `pointer` em NDC `(0.5, -1)` vira `tx = 1.6`, `ty = -1.7`; teclado ativo ignora o ponteiro até ele se mexer de novo; `pointer: null` e sem teclas deixa o alvo onde está (toque sem ponteiro, nave no centro); `setas e WASD` mapeiam para `kx/ky` (`ArrowLeft`/`a`/`A` etc.); **`releaseAll` zera tudo e o `blur` da janela o chama** (Review Focus 2), testado com uma janela falsa que dispara `keydown` de `ArrowLeft` e depois `blur`.
  - `camera`: com a nave em `(0,0)` e velocidade 14: `px=0, py=1.35, pz=4.6`, alvo `(0, 0.15, -30)`, `fov = 58 + 14·0.22`; com nave em `(2, 1)`: `px = 1.1`, `py = 1.8`, `tx = 0.7`, `ty = 0.45`; `fov` satura em `58 + 40·0.22`. `blendPose(a, b, 0)` é `a` e `(…, 1)` é `b`; `stepBlend(0, 1, 1/60)` sobe e nunca passa de 1; `stepBlend(1, 0, 10)` chega a menos de 0,001.
- [ ] **Step 2: Rodar `npm test`.** Esperado: FALHA.
- [ ] **Step 3: Implementar** as duas funções puras e a ligação com o DOM (`pointermove` e `pointerdown` em NDC com y para cima, `keydown`/`keyup` com `preventDefault` nas setas, `blur` chama `releaseAll`). Câmera: posição `(0.55·x, 1.35 + 0.45·y, 4.6)`, alvo `(0.35·x, 0.15 + 0.3·y, -30)`; `stepBlend` usa `1 - exp(-dt·2.2)`.
- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** — `game: steering and chase camera`.

---

### Task 5: Fases, regras de clique e textos

**Files:**
- Create: `src/game/phases.js`, `src/game/clickRules.js`, `src/game/text.js`, e um `*.test.js` para cada

**Interfaces:**
- Produces: `PHASE = {IDLE, ENTER, PLAY, DYING, SCORE, EXIT}`; `createPhases(): {phase, t, begin(), tick(dt), die(), exit(), canRestart(): boolean}` (`canRestart()` é `phase === SCORE && t >= SCORE_RESTART_S`, monotônico dentro de SCORE; não há `markScoreFormed`: o texto da nota é montado já na morte, durante a explosão, então já está pronto quando SCORE começa); `ENTER_S = 1.5`, `DYING_S = 1.5`, `SCORE_RESTART_S = 1.7`, `EXIT_S = 1.5`.
  `clickAction(s: {headOn, headFormed, onHead, onName, reducedMotion, gameActive}): 'toggle'|'startGame'|'none'`.
  `formatTime(seconds: number, lang: 'en'|'pt'): string`; `exitLabel(lang): string`.

- [ ] **Step 1: Escrever os testes.**
  - `phases` (Review Focus 5): `begin` em IDLE leva a ENTER; `begin` em ENTER ou PLAY é ignorado; `tick(ENTER_S)` leva ENTER a PLAY; `die` só vale em PLAY (nas demais fases é ignorado); `tick(DYING_S)` leva DYING a SCORE; `canRestart()` é falso em SCORE antes de `SCORE_RESTART_S` e verdadeiro depois; `begin` em SCORE só vale se `canRestart()` (senão ignorado); `exit` vale em ENTER, PLAY, DYING e SCORE, e leva a EXIT; `exit` duas vezes não muda nada; `tick(EXIT_S)` leva EXIT a IDLE; `exit` em IDLE é ignorado.
  - `clickAction`: nome sem cabeça e `onName` → `'toggle'`; cabeça formada, `onHead` → `'startGame'`; cabeça formada, clique fora → `'toggle'`; cabeça ainda se formando, `onHead` → `'none'`; `reducedMotion` com cabeça e `onHead` → `'toggle'` (a cabeça funciona como hoje); `gameActive` → sempre `'none'`.
  - `text`: `formatTime(42.34, 'pt') === '42,3 s'`, `formatTime(42.34, 'en') === '42.3 s'`, `formatTime(0, 'pt') === '0,0 s'`, `formatTime(125.96, 'en') === '126.0 s'`; `exitLabel('pt') === 'Voltar ao nome'`, `exitLabel('en') === 'Back to the name'`.
- [ ] **Step 2: Rodar `npm test`.** Esperado: FALHA.
- [ ] **Step 3: Implementar** os três módulos. `phases.t` é o tempo na fase atual.
- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS (todas as suítes).
- [ ] **Step 5: Commit** — `game: phase machine, click rules and copy`.

---

### Task 6: O jogo dentro do campo de partículas (GPU)

**Files:**
- Create: `src/shaders/lib/game.glsl`, `scripts/game-check.cjs`
- Modify: `src/ParticleField.js`, `src/shaders/simVelocity.frag`, `src/shaders/simPosition.frag`

**Interfaces:**
- Consumes: `Budget`, `GameUniforms`, `buildGameLocal`.
- Produces em `ParticleField`: `setGame(gameIndex: number, scoreIndex: number): void` (marca as duas frases virtuais); `setGameBudget(budget: Budget, local: Float32Array): void`; `setGameState(u: GameUniforms): void`; `pulseBurst(): void` (impulso para fora no próximo quadro); `setPhrase(index: number, text: string): Promise<void>` (reconstrói o destino de uma frase em fatias entre quadros e descarta o antigo); `readPositions(): Float32Array` (só para conferência); `setCamera(camera, focus?: number)` (o `focus` opcional substitui `camera.position.length()`).
  Em GLSL, `game.glsl` exporta `GameGoal gameGoal(float idx)` com `struct GameGoal { vec3 pos; vec3 vel; float k; float free; float role; }`.

- [ ] **Step 1: Escrever a conferência `scripts/game-check.cjs positions`** (Playwright global, `BASE=http://localhost:5199`; o servidor sobe com `npm run dev -- --port 5199`): abre o site, espera `window.__pf`, importa `/src/game/budget.js`, `shapes.js` e `world.js` com `import()` dentro de `page.evaluate`, monta `world` com nave em (0,0), chama `field.setGame(g, g + 1)` com `g = field.phrases.length`, `setGameBudget`, `setPair(0, g)`, `setMorph(1)`, `setGameState(gameUniforms(world))`, roda 90 quadros e lê `field.readPositions()`. Critérios, impressos como `PASS`/`FAIL`: (a) cada partícula do casco está a menos de 0,06 de `ship + local`; (b) cada partícula do meteorito 0 está a menos de 0,001 de `slot + R·rot(local)` (posição direta, sem lag); (c) cada partícula de risco que não reaparece entre dois quadros avança `speed·dt` em `z` (a menos de 0,001), e todas ficam em `z ∈ [-125, 8]`; (d) partículas além de `active` não se mexem mais de 0,05 entre dois quadros. O script retorna código ≠ 0 se algum falhar.
- [ ] **Step 2: Rodar `node scripts/game-check.cjs positions`.** Esperado: FALHA (API inexistente).
- [ ] **Step 3: Implementar `game.glsl`** portando `evalGoal` do protótipo para GLSL: papel pelo índice (`idx = floor(gl_FragCoord.y)·resolution.x + floor(gl_FragCoord.x)` comparado com `uGameEnds`); chama `[0,flame)`, casco, anel, meteoritos, riscos; parâmetros de cada risco (`θ, r, z0, comprimento, brilho`) derivados de um hash do índice do risco; partículas além de `active` ficam livres (destino = onde estão). Molas por papel: nave 70, anel 40, meteoritos 18, riscos 30; livre (morta ou estacionada) `k = 0`. Uniforms: `uGameLocal` (textura de `local`), `uGameEnds` (vec4: flame, shipEnd, ringEnd, meteorEnd), `uGameActive`, `uShip`, `uShipRot`, `uMeteor[10]`, `uMeteorRot[10]`, `uGameSpeed`, `uGameDist`, `uGameAlive`, `uDeadFor`, `uBurst`. O chunk é concatenado nos shaders de velocidade **e de posição** em `ParticleField`, como já é feito com `simplex` e `curl`.
- [ ] **Step 4: Ligar em `simVelocity.frag`**, seguindo o padrão de `uHeadA/uHeadB`: `uGameA`/`uGameB` dizem qual extremo do morph é o jogo. O ramo só roda quando um deles é 1: `ga`/`gb` vêm de `gameGoal`; o peso do jogo é `gw = uGameA·(1−m) + uGameB·m`; nesse peso a força vira `(goal − pos)·k − c·(vel − goalVel)` com `c = 1.9·√k`, sem o amortecimento multiplicativo, sem turbulência, sem repulsão do cursor e sem fluido; `uMaxSpeed` sobe a 120 quando `gw > 0`. `uBurst` soma, uma vez, `normalize(pos − nave + ruído) · (2 + 7·hash)` aos papéis de nave, chama e anel.
- [ ] **Step 5: Ligar em `simPosition.frag`**: com `uMorph` replicado nos uniforms de posição (`setMorph` atualiza os dois), meteoritos e riscos usam **posição direta** (`pos.xyz = goal`) quando `(uGameB>0.5 && uMorph>0.999) || (uGameA>0.5 && uMorph<0.001)`. É assim que o reaparecimento "salta" em vez de atravessar a cena.
- [ ] **Step 6: Implementar a API em `ParticleField`.** Frase virtual: `ParticleField.js` exporta `GAME_PHRASE = Object.freeze({ game: true })`; `setGame(gameIndex, scoreIndex)` estende `phrases`/`targets`/`bounds` com `GAME_PHRASE` e `'0,0 s'` quando os índices são maiores ou iguais ao tamanho atual (senão só marca os índices); `#target` trata qualquer frase com `.game === true` como o jogo e devolve uma textura 1×1 com `bounds` de meia-largura 0; o índice da nota só é construído em `setPhrase` (`buildRemaining` pula os dois). Os uniforms do jogo (`uGameLocal`, `uGameEnds`, `uGameActive`, `uGameAlive`, `uDeadFor`) são **os mesmos objetos** nos materiais de velocidade, de posição e dos pontos, para a Tarefa 7 não precisar de um segundo envio. `setGameBudget` guarda o orçamento em `field.gameBudget` (a conferência de custo o lê) e envia `local` como `DataTexture` RGBA float `size×size`. `readPositions` usa `renderer.readRenderTargetPixels` no alvo de posição atual.
- [ ] **Step 7: Rodar `node scripts/game-check.cjs positions`.** Esperado: quatro linhas `PASS`.
- [ ] **Step 8: Conferir que o herói não mudou:** abrir o site (`npm run dev`), sem erro no console, nome formando como antes, cabeça ainda aparece ao clicar. `npm test` continua verde.
- [ ] **Step 9: Commit** — `game: destination shader and field hooks`.

---

### Task 7: O visual das partículas no jogo

**Files:**
- Modify: `src/shaders/points.vert`, `src/ParticleField.js`, `scripts/game-check.cjs`

**Interfaces:**
- Produces: `ParticleField.setGameLook(amount: number): void` (0 = visual do herói, 1 = visual do jogo; mistura contínua).

- [ ] **Step 1: Escrever a conferência `scripts/game-check.cjs look`:** em cada nível (`#nivel1`, `#nivel2`, `#nivel3`), com `setGame(g, g + 1)` (`g = field.phrases.length`), `setPair(0, g)`, `setMorph(1)`, `setGameLook(1)`, câmera de `gameCamera` e o mundo em `t = 8`, tira uma captura em `shots/look-nivelN.png` e imprime a fração de pixels não-escuros. Critérios: nenhum erro no console, e a fração entre 0,2% e 12% (nem vazio nem estourado em branco).
- [ ] **Step 2: Rodar a conferência.** Esperado: FALHA (`setGameLook` inexistente).
- [ ] **Step 3: Implementar em `points.vert`** um ramo `if (uGame > 0.001)` (com `uGame = 0` o caminho do herói fica idêntico, sem custo): papel pelo índice (`aRef`); partículas estacionadas e as de brilho zero vão para fora do clip; brilho por papel porta o `evalGoal` do protótipo (cauda dos riscos `pow(1−k/K, 1.3)`, fade de longe em `z ∈ [-112, -85]` e de perto em `z ∈ [1.5, 5]`, chama pela fase, nave e anel pelo `w` da textura local, fade da nave morta por `uDeadFor`); tamanhos por papel (nave 0,018, chama 0,024, anel 0,016, meteorito 0,02, risco 0,022, na escala do `pointSize` do herói); desfoque por profundidade `uDof = 0.011` no jogo; compensação do brilho de pontos menores que o mínimo **pela metade** (`vFocus *= comp`, `comp = truePx / max(truePx, minPx)`), do protótipo. O brilho do protótipo foi calibrado com uma segunda passada de brilho falso; aqui o bloom do site faz esse papel, então os brilhos são **ponto de partida**.
- [ ] **Step 4: Rodar a conferência.** Esperado: PASS nos três níveis. Abrir as três capturas e comparar com a referência (o protótipo no mesmo estado): nave de costas com casco denso e asas ralas, riscos radiais saindo do centro, meteoritos como cascas. Ajustar os brilhos até o casco não estourar em branco com 70 mil e os riscos serem visíveis.
- [ ] **Step 5: Commit** — `game: particle look`.

---

### Task 8: O controlador do jogo

**Files:**
- Create: `src/game/index.js`

**Interfaces:**
- Consumes: tudo das tarefas 1 a 7.
- Produces: `createGame(ctx: GameContext): Game`.
  `GameContext = { field, camera, renderer, indices: {REST, GAME, SCORE}, level: () => 1|2|3, lang: () => 'en'|'pt', heroPose: () => {px,py,pz}, hooks: { onEnter(): void, onExited(): void, onRunEnd(info: {slow: boolean, seconds: number}): void } }`.
  `Game = { readonly active: boolean, readonly phase: string, start(from: number): void, update(dt: number, now: number): void, requestExit(): void }`. Em DEV, `game.debug = { kill(): void, world }`.

- [ ] **Step 1: Escrever a conferência `scripts/game-check.cjs flow`** (parte 1, sem a integração com o `main.js` ainda): com `createGame` montado a mão a partir de `window.__pf`, `start(REST)` leva a `enter` e depois `play` (após 1,5 s de passos); `debug.kill()` leva a `dying` e depois `score`; um clique depois de 1,7 s em `score` leva a `enter`; `requestExit()` leva a `exit` e depois `idle`, chamando `hooks.onExited` exatamente uma vez. Critério: fases na ordem e sem erro no console.
- [ ] **Step 2: Rodar a conferência.** Esperado: FALHA (módulo inexistente).
- [ ] **Step 3: Implementar `createGame`.** A cada `start`: monta o orçamento do nível atual e a textura local (guarda em cache por nível), cria o mundo, `field.setPair(from, GAME)`, `onEnter`. `update(dt, now)`: avança `phases`; em ENTER leva o morph de 0 a 1 em `ENTER_S` com `ease`; passa os controles (`steerTarget` com a direção lida de `attachControls`), `stepWorld`, `field.setGameState(gameUniforms(world))`; câmera por `gameCamera`/`blendPose`/`stepBlend` (alvo 1 em ENTER/PLAY/DYING, 0 nas demais), atualizando `camera.fov`, a projeção, `field.setPixelScale(altura / (2·tan(fov/2)))`, `camera.updateMatrixWorld()` e só então `field.setCamera(camera, distânciaAtéNave)`; `field.setGameLook` acompanha a mistura da câmera. Ao morrer (`world.alive` falso): `pulseBurst()`, fase DYING, mundo desacelera `×exp(-2.2 dt)`; na morte já dispara `field.setPhrase(SCORE, formatTime(world.t, lang()))` (a promessa roda durante a explosão); ao fim de DYING espera essa promessa (normalmente já resolvida), faz `setPair(GAME, SCORE)` e leva o morph de 0 a 1; em SCORE, o clique (via `pointerdown`) vale só se `phases.canRestart()`: `setPair(SCORE, GAME)` e novo mundo. `requestExit()` (`Esc` ou "×"): `setPair(atual, REST)`, morph 0→1 em `EXIT_S`, o mundo continua com `collide: false`; ao fim, `setPair(REST, HOVER)` é responsabilidade do `main.js` em `onExited`. Mede os tempos de quadro em PLAY (ignora os 30 primeiros) e chama `onRunEnd({slow: >25% dos quadros acima de 21 ms com 150 amostras ou mais, seconds})` ao morrer ou sair.
- [ ] **Step 4: Rodar a conferência `flow` (parte 1).** Esperado: PASS.
- [ ] **Step 5: Commit** — `game: controller`.

---

### Task 9: Integração no hero

**Files:**
- Modify: `src/main.js`, `index.html`, `src/styles.css`, `src/homeI18n.js` (só o gancho de troca, se necessário)

**Interfaces:**
- Consumes: `clickAction`, `createGame`, `exitLabel`.

- [ ] **Step 1: Estender a conferência `flow` (parte 2):** no site real, com a cabeça formada, clicar nela: `window.__pf.game.phase` vira `enter` e depois `play`; `document.documentElement.classList` tem `game-on`; `window.scrollY` não muda ao rolar com a roda; `Esc` leva a `exit` e depois `idle`, com o nome formando de novo e `game-on` removido. Clicar fora da cabeça (cabeça formada) volta ao nome sem iniciar o jogo. Com `prefers-reduced-motion` emulado, clicar na cabeça volta ao nome e o jogo não inicia.
- [ ] **Step 2: Rodar `flow`.** Esperado: FALHA.
- [ ] **Step 3: Implementar em `main.js`.** Índices das frases virtuais calculados em `boot()` depois que `headMap` é conhecido (`GAME = base + (headMap ? 1 : 0)`, `SCORE = GAME + 1`), com `phrasesFor` acrescentando o `GAME_PHRASE` exportado por `ParticleField.js` e a string `'0,0 s'` como espaço da nota (iguais nos dois idiomas, para a troca de idioma preservar o destino); `field.setGame(GAME, SCORE)`. O clique de `window` passa a chamar `clickAction(...)`: `'startGame'` faz `import('./game/index.js')` na primeira vez, cria o jogo e chama `game.start(HEAD)`; `'toggle'` chama `toggleHead()`; `game.active` ignora o clique (o jogo trata os seus). Um ramo no início de `step()`: se `game?.active`, roda `elapsed += dt`, `game.update(dt, now)`, `field.update(dt, elapsed)`, `post.render(dt, elapsed)` e retorna. `hooks.onEnter`: classe `game-on` em `<html>`, `dust.visible = false`, `probing = false`, `field.setHeadSolid(0)`, `setDim(0)`, `setSnap(0)`, `setRepelScale(0)`, `post.setBloomScale(L.bloom)`, `document.body.style.cursor = ''`. `hooks.onExited`: remove `game-on`, `dust.visible = true`, restaura `camera.fov = FOV` e a projeção, `headOn = false`, `morphT = 0`, `chainShown = 0`, e **força o par sem passar pelo cache de `usePair`**: `field.setPair(REST, HOVER); pairA = REST; pairB = HOVER; field.setMorph(0)` (se o cache já valesse `REST/HOVER`, como no `#jogo`, o `usePair` retornaria cedo e deixaria o campo no par `GAME/REST`). `hooks.onRunEnd`: se `slow && level > 1`, `stepDown()`; o campo não muda de grade, o orçamento menor vale na partida seguinte. `resize()` passa a calcular `pixelScale` com `camera.fov` atual. `onHomeSwitch` retorna cedo se `game?.active`. `#jogo` no endereço inicia o jogo direto do nome (`game.start(REST)`) depois do primeiro quadro, como `#nivel` e `#ajuste`, exceto sob movimento reduzido. Em DEV, `window.__pf.game = game`.
- [ ] **Step 4: Implementar `index.html` e `styles.css`.** Botão `<button type="button" class="game-exit" data-game-exit hidden>×</button>` com o mesmo visual e posição de `.lang-toggle-fixed`; o `aria-label` vem de `exitLabel(lang)` quando o jogo entra, e `Esc` e o clique chamam `game.requestExit()`. `html.game-on`: `overflow: hidden`, `.overlay` com `opacity: 0` e transição, `[data-lang-toggle]` com `visibility: hidden; pointer-events: none`, `#scene { touch-action: none }`, `.game-exit` visível.
- [ ] **Step 5: Rodar `flow` e `npm test`.** Esperado: PASS; sem erro no console.
- [ ] **Step 6: Commit** — `game: hero integration`.

---

### Task 10: Conferência do fluxo completo e dos casos de borda

**Files:**
- Modify: `scripts/game-check.cjs` (parte 3 de `flow`), correções onde falharem

- [ ] **Step 1: Escrever a parte 3 de `flow`** (Review Focus 3, 4 e 5), em nível forçado `#nivel1`:
  - **Idioma:** durante `play`, `document.querySelector('[data-lang-toggle]').click()` (ignora o CSS) não muda a fase nem inicia troca: `field.currentIndex` e `game.phase` ficam iguais, e `document.documentElement.lang` não muda.
  - **Redimensionar:** durante `play`, `page.setViewportSize` de 1280×720 para 390×844 e de volta: sem erro; `field.material.uniforms.uPixelScale.value` fica igual a `renderer.domElement.height / (2·tan(camera.fov/2))` com tolerância 0,001 nos dois tamanhos.
  - **Apertar tudo:** `kill()` seguido de `Esc` na hora; dois cliques seguidos logo depois da explosão (nenhum reinicia antes de `canRestart()`); `Esc` duas vezes; depois de tudo, `game.phase === 'idle'`, `scrollY === 0`, o nome volta a formar e `game-on` foi removido; repetir o ciclo inteiro 3 vezes sem erro nem fase presa.
  - **Rolagem:** depois de sair, rolar a página funciona como antes.
  - Captura nas fases `play`, `dying`, `score` em `shots/flow-*.png`.
- [ ] **Step 2: Rodar `node scripts/game-check.cjs flow`.** Corrigir o que falhar até PASS, repetindo a parte falha depois de cada correção.
- [ ] **Step 3: Rodar `npm test` e `npm run build`.** Esperado: testes verdes; o build gera o jogo como um *chunk* separado (conferir em `dist/assets` que existe um arquivo novo com o código de `src/game/index.js`).
- [ ] **Step 4: Commit** — `game: edge-case fixes and flow checks`.

---

### Task 11: Custo do herói e escala por nível

**Files:**
- Modify: `scripts/game-check.cjs` (`bench`)

- [ ] **Step 1: Escrever `bench`:** mede o tempo médio de quadro do herói (10 s em `#nivel1`, depois de 3 s de aquecimento) na branch e em `main` (`git worktree add ../pf-main main`, servidor próprio em outra porta); imprime os dois e o quociente. Também confirma que, nos três níveis, o orçamento usado pelo jogo é o da tabela (`field.gameBudget.active` igual a 70000, 40000, 25000).
- [ ] **Step 2: Rodar `bench`.** Critério: o herói na branch não passa de `+10%` do de `main`; os três orçamentos batem. Se passar, procurar o ramo do shader que pesa mais e movê-lo para trás do `if (uGameA>0.5 || uGameB>0.5)`.
- [ ] **Step 3: Ver o bundle:** `npm run build`; o tamanho do *chunk* principal cresce só pelas poucas centenas de bytes dos ganchos no shader e no `main.js`; o código do jogo está no *chunk* separado.
- [ ] **Step 4: Commit** — `game: hero cost check`.

---

### Task 12: Ajuste fino, capturas e entrega

**Files:**
- Modify: valores de brilho e tamanho em `points.vert`/`game.glsl` conforme necessário; `docs/superpowers/specs/2026-11-24-particle-ship-game-design.md` (status)

- [ ] **Step 1: Comparar com o protótipo.** Abrir `npm run dev` no navegador do Gabriel, jogar nos três níveis (`#nivel1`, `#nivel2`, `#nivel3`) e comparar com o protótipo aprovado. Ajustar brilho, tamanho dos pontos e bloom só em constantes do shader, sem mudar a estrutura. Registrar os valores finais no design, na seção "Protótipo de referência".
- [ ] **Step 2: Rodar o conjunto.** `npm test`, `node scripts/game-check.cjs positions`, `look`, `flow`, `bench` e `npm run build`: tudo verde.
- [ ] **Step 3: Atualizar a descrição do PR #1** (hoje só traz o design) com o que o jogo faz, as capturas de `shots/` e a nota de que a taxa de quadros real só se mede no computador do Gabriel.
- [ ] **Step 4: Commit e push** — `game: final tuning`; depois `git push`.

---

## Auto-revisão

- **Cobertura do design:** fluxo e cliques (T5, T9); mundo, corredor, controles, câmera e colisão (T3, T4); papéis, proporções, densidade como transparência (T1, T2, T6, T7); molas por papel e destino no shader (T6); explosão, nota em partículas e reinício (T6, T8); orçamento por nível e queda entre partidas (T1, T8, T9, T11); movimento reduzido (T5, T9); "×" e `Esc` (T4, T9); carregamento sob demanda e custo do herói (T9, T10, T11); verificação com testes puros, capturas por nível e fps só no computador do Gabriel (T1–T12). Escolhas 1 a 10 do design estão em T5, T8, T9 e T1.
- **Consistência de nomes:** `Budget`, `gameBudget`, `buildGameLocal`, `createWorld`, `stepWorld`, `gameUniforms`, `steerTarget`, `gameCamera`, `createPhases`, `clickAction`, `formatTime`, `createGame` e os métodos de `ParticleField` aparecem com a mesma assinatura onde são produzidos e onde são usados.
- **Proporção:** o plano descreve decisões, assinaturas e critérios; os corpos de função ficam para quem implementa, com o protótipo como referência dos algoritmos.
