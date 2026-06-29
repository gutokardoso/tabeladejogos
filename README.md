# App Copa 2026 — correção de AO VIVO e detalhes

Correções desta versão:

- O card só fica verde e com “AO VIVO” quando:
  - a fonte/API informa status real de jogo ao vivo; ou
  - faltam até 30 minutos para o início, no mesmo dia da partida.
- Jogos futuros de outras datas não entram mais como AO VIVO.
- O relógio não reinicia artificialmente em jogos que ainda não começaram.
- A lógica bloqueia falso status ao vivo vindo de fontes inconsistentes quando o horário oficial ainda está distante.
- A tela de detalhes continua tentando enriquecer informações por ESPN Summary, ESPN Play-by-play, TheSportsDB, Sofascore/proxy e backend configurável.
- Corrigida a extração de estatísticas da ESPN.
- Atualizado o Service Worker para evitar cache antigo no navegador.

Importante: para detalhes 100% completos e garantidos em tempo real, configure um backend/proxy profissional em `detailsProxyEndpoint`, pois muitas fontes públicas bloqueiam CORS no navegador.
