# App Copa — tempo oficial e detalhes profissionais

Atualização aplicada:
- O cronômetro agora aceita minutos oficiais acima de 90, incluindo prorrogação (91–120+) e pênaltis.
- O app prioriza o relógio oficial da API/fonte conectada antes de estimar localmente.
- A página de detalhes tenta enriquecer jogo por jogo com: estádio, árbitro, público, gols, cartões, faltas, substituições e estatísticas.
- Foram adicionadas camadas de busca: backend/proxy configurável, ESPN Summary, ESPN Play-by-Play, ESPN Scoreboard, TheSportsDB e tentativa pública via proxy.
- Para uso profissional com dados 100% completos, configure `detailsProxyEndpoint` em `data.js` com uma API/proxy próprio que consulte fontes como Google/ESPN/Sofascore/Flashscore/fornecedor oficial, evitando bloqueios de CORS.

Arquivos principais:
- `index.html`
- `style.css`
- `app.js`
- `data.js`
- `manifest.webmanifest`
- `sw.js`
