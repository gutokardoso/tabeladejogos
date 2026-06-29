# App Copa - correção do relógio ao vivo

Correções nesta versão:

- Remove o texto duplicado depois do tempo, como `• 14'`.
- Exibe somente `Tempo: mm:ss` nos cards ao vivo.
- Quando a API fornece apenas o minuto cheio (`14'`), o app usa o segundo do relógio do dispositivo para evitar que o contador volte para `14:00` ao atualizar a página.
- Quando a API fornece `mm:ss`, o app usa esse tempo oficial como base.
- Mantém a sincronização em `localStorage` por partida para preservar o relógio entre recarregamentos.

Observação: se a fonte oficial não entregar segundos reais, nenhum front-end consegue saber o segundo exato da transmissão; neste caso o app mantém uma contagem contínua aproximada até a próxima sincronização da API.
