# App Copa — previsões e detalhes enriquecidos

Atualização aplicada:
- A tela de detalhes não depende mais de uma única resposta de API para gols/cartões/faltas.
- Ao abrir um jogo, o app tenta enriquecer os detalhes em múltiplas fontes públicas: ESPN Summary, ESPN Play-by-Play e TheSportsDB.
- A mensagem antiga “Nenhum gol informado pela API até agora.” foi removida.
- Quando não houver detalhe individual disponível, o app informa que as fontes conectadas ainda não retornaram autor/minuto, em vez de afirmar que não existe gol.

Observação: algumas informações detalhadas podem depender da disponibilidade/cobertura da fonte pública e de CORS. Para produção comercial, recomenda-se conectar um backend/proxy com API esportiva oficial.
