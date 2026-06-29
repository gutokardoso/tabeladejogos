const API_CONFIG = {
  // Provedor padrão sem chave. Caso a ESPN mude o endpoint/CORS, o app continua funcionando com os dados locais abaixo.
  provider: 'espn',
  espnEndpoint: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
  refreshSeconds: 60,

  // Opcional: para produção com API oficial/comercial, preencha abaixo e troque provider para 'football-data'.
  // Atenção: token em front-end fica visível. Para uso profissional, use um backend/proxy.
  footballDataEndpoint: 'https://api.football-data.org/v4/competitions/WC/matches',
  footballDataToken: ''
};

const COPA_DATA = {
  lastUpdated: '2026-06-28',
  source: 'fallback-local',
  teams: {
    Argentina: { rating: 96, market: 94, tradition: 98, fifa: 1 },
    Brasil: { rating: 94, market: 95, tradition: 100, fifa: 5 },
        França: { rating: 95, market: 96, tradition: 94, fifa: 2 },
        Inglaterra: { rating: 92, market: 95, tradition: 88, fifa: 4 },
        Espanha: { rating: 91, market: 93, tradition: 90, fifa: 3 },
        Portugal: { rating: 89, market: 91, tradition: 84, fifa: 6 },
    Marrocos: { rating: 84, market: 81, tradition: 80, fifa: 12 },
        Japão: { rating: 80, market: 78, tradition: 76, fifa: 18 },
        Áustria: { rating: 81, market: 79, tradition: 77, fifa: 21 },
    Suíça: { rating: 82, market: 80, tradition: 79, fifa: 17 },
        Argélia: { rating: 79, market: 76, tradition: 72, fifa: 28 },
    Noruega: { rating: 83, market: 88, tradition: 72, fifa: 24 },
        'Costa do Marfim': { rating: 78, market: 75, tradition: 75, fifa: 36 },
        'RD Congo': { rating: 74, market: 70, tradition: 68, fifa: 54 },
    Panamá: { rating: 68, market: 62, tradition: 60, fifa: 52 },
    Jordânia: { rating: 65, market: 58, tradition: 55, fifa: 67 },
    'Cabo Verde': { rating: 73, market: 69, tradition: 60, fifa: 49 }
  },
  matches: [
    { date: '2026-06-26T16:00:00-03:00', stage: 'Grupo I', home: 'Noruega', away: 'França', homeScore: 1, awayScore: 4, status: 'Finalizado' },
    { date: '2026-06-27T16:00:00-03:00', stage: 'Grupo L', home: 'Panamá', away: 'Inglaterra', homeScore: 0, awayScore: 2, status: 'Finalizado' },
    { date: '2026-06-28T16:00:00-03:00', stage: 'Grupo J', home: 'Argentina', away: 'Jordânia', homeScore: 3, awayScore: 1, status: 'Finalizado' },
    { date: '2026-06-28T16:00:00-03:00', stage: 'Grupo J', home: 'Argélia', away: 'Áustria', homeScore: 3, awayScore: 3, status: 'Finalizado' },
    { date: '2026-06-29T14:00:00-03:00', stage: 'Mata-mata', home: 'Brasil', away: 'Japão', status: 'Agendado' },
    { date: '2026-06-30T14:00:00-03:00', stage: 'Mata-mata', home: 'Costa do Marfim', away: 'Noruega', status: 'Agendado' },
    { date: '2026-07-01T13:00:00-03:00', stage: 'Mata-mata', home: 'Inglaterra', away: 'RD Congo', status: 'Agendado' },
    { date: '2026-07-02T16:00:00-03:00', stage: 'Mata-mata', home: 'Espanha', away: 'Áustria', status: 'Agendado' },
    { date: '2026-07-02T16:00:00-03:00', stage: 'Mata-mata', home: 'Argentina', away: 'Cabo Verde', status: 'Agendado' }
  ]
};
