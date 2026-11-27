# Ranking: como ativar

Ao bater, o jogo envia o tempo para `/api/rank` e mostra a sua posição entre
todas as partidas (ex.: `42,3 s  ·  #37 de 1.204`) e, abaixo, o **top 5 do
mundo** (só os tempos, em duas colunas, sem nomes). Sem o armazenamento abaixo
configurado, a função responde 503 e a tela de pontuação mostra só o tempo,
como antes. Nada quebra.

## Ativar (uma vez, no painel da Vercel)

1. Projeto na Vercel → **Storage** (ou **Marketplace**) → **Upstash Redis** →
   criar um banco (o plano gratuito basta).
2. **Connect to project** e escolher este projeto, nos ambientes Production e
   Preview. A Vercel adiciona sozinha `KV_REST_API_URL` e `KV_REST_API_TOKEN`
   (ou `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`; os dois pares
   funcionam).
3. Opcional: definir `RANK_SALT` com um texto qualquer, que entra no hash do IP.
4. **Redeploy** (as variáveis só valem em um deploy novo).

Eu não consigo fazer esses passos: dependem da sua conta na Vercel.

## Rodando localmente

`npm run dev` (Vite) não serve `/api`: o cliente cai no modo "só o tempo". Para
testar o ranking de verdade, use `vercel dev` com as variáveis do projeto
(`vercel env pull`).

## O que é guardado

- Um conjunto ordenado `ship:times`: um id aleatório por partida e o tempo em
  segundos. Nenhum dado pessoal.
- Para limitar abuso (200 partidas por hora por endereço), um contador
  `rl:<hash>` que expira em 1 hora. Só o hash do IP vai ao Redis, nunca o IP.
- O top 5 sai do mesmo conjunto (`ZREVRANGE`) e a API devolve só os tempos,
  nunca os ids das partidas.
- A posição é 1 + o número de partidas estritamente mais longas; tempos iguais
  dividem a posição.

## Limites conhecidos

- O tempo vem do navegador, então um visitante determinado pode enviar um valor
  falso. O servidor só rejeita o que não é plausível (< 0,5 s ou > 1 h) e
  limita a frequência. É um ranking de portfólio, não de competição.
- O conjunto cresce sem limite (cerca de 60 bytes por partida), o que é
  irrelevante nessa escala.
