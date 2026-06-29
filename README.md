# App Copa - correção do relógio ao vivo

Correções nesta versão:

- Remove o texto duplicado depois do tempo, como `• 14'`.
- Exibe somente `Tempo: mm:ss` nos cards ao vivo.
- Quando a API fornece apenas o minuto cheio (`14'`), o app usa o segundo do relógio do dispositivo para evitar que o contador volte para `14:00` ao atualizar a página.
- Quando a API fornece `mm:ss`, o app usa esse tempo oficial como base.
- Mantém a sincronização em `localStorage` por partida para preservar o relógio entre recarregamentos.

Observação: se a fonte oficial não entregar segundos reais, nenhum front-end consegue saber o segundo exato da transmissão; neste caso o app mantém uma contagem contínua aproximada até a próxima sincronização da API.


## Atualização de relógio oficial

- O cronômetro agora usa o relógio/status oficial da API como fonte principal.
- Em intervalo, pausa oficial, pênaltis ou jogo encerrado, o tempo para automaticamente.
- Acréscimos oficiais como 45+4, 90+7, 105+2 e 120+1 são preservados quando retornados pela fonte.
- A contagem local só é usada entre sincronizações oficiais e sempre respeita o limite do período atual.


## Correção de eventos oficiais

- Removida a geração automática/simulada de autores e minutos de gols.
- Os detalhes dos jogos agora priorizam dados retornados por fontes oficiais/confiáveis: proxy configurável, ESPN Summary/Play-by-play/Scoreboard, TheSportsDB e Sofascore via proxy.
- Quando houver correção verificada para um jogo específico, ela é mesclada sem sobrescrever dados oficiais mais completos.
- Alemanha x Paraguai corrigido para:
  - 42’ Gol de Julio Enciso • Paraguai
  - 54’ Gol de Kai Havertz • Alemanha, assistência de Florian Wirtz
- Para produção, configure `API_CONFIG.detailsProxyEndpoint` com um backend próprio ligado a uma API esportiva licenciada para garantir eventos completos em tempo real sem bloqueio de CORS.


## Modo gratuito de detalhes

Esta versão usa fontes gratuitas quando disponíveis e mantém um cache local no navegador para gols, cartões, faltas, substituições, estádio, árbitro e estatísticas.

Como fontes gratuitas podem falhar por CORS, atraso ou falta de cobertura, a tela de detalhes possui um painel “Completar/corrigir detalhes manualmente”. As informações salvas ficam no `localStorage` do navegador e aparecem automaticamente ao reabrir o jogo.

Formato das linhas manuais:

- `estadio | Nome do estádio`
- `arbitro | Nome do árbitro`
- `publico | 68.777`
- `gol | 54’ | Kai Havertz | Alemanha | Assistência opcional`
- `cartao | 71’ | Jogador | Time | amarelo`
- `falta | 80’ | Jogador que fez | Jogador que sofreu | Time`
- `sub | 65’ | Jogador que entrou | Jogador que saiu | Time`
- `stat | possession | Alemanha 52% x 48% Paraguai`

Nenhum autor/minuto de gol é inventado automaticamente.
