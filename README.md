# App Copa 2026 — Tabela ao vivo, estatísticas e previsões

App web estático em HTML, CSS e JavaScript.

## O que foi adicionado
- Atualização automática de placares pela internet.
- Botão “Atualizar placares”.
- Sincronização automática a cada 60 segundos.
- Cards de jogos ao vivo.
- Fallback local: se a API falhar, o app continua abrindo com os dados do arquivo `data.js`.

## Fonte dos placares
O app vem configurado para buscar dados no endpoint público de scoreboard da ESPN:

```js
provider: 'espn'
espnEndpoint: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
```

Caso queira usar uma API oficial/comercial, o arquivo `data.js` já tem configuração pronta para `football-data.org`. Basta trocar `provider` para `football-data` e preencher o token.

> Importante: token em app front-end fica visível. Para projeto comercial, o ideal é criar um backend/proxy para proteger a chave.

## Como usar
Abra `index.html` no navegador ou publique a pasta na Vercel/Netlify.

## Como atualizar manualmente se a API falhar
Edite o arquivo `data.js`.

- Para jogo finalizado, preencha `homeScore`, `awayScore` e `status: 'Finalizado'`.
- Para jogo futuro, deixe os placares vazios.
- Para ajustar a força de uma seleção, altere `rating`, `market`, `tradition` e `fifa`.

## Como funciona a previsão
O app calcula um `powerScore` levando em conta força técnica, valor/elenco, tradição, ranking, desempenho nos jogos já finalizados, saldo de gols e gols marcados.

A previsão não é aposta, é uma estimativa estatística para conteúdo editorial/promocional.
