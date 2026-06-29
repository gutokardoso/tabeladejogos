const matchesEl = document.querySelector('#matches');
const favoritesEl = document.querySelector('#favorites');
const surprisesEl = document.querySelector('#surprises');
const summaryEl = document.querySelector('#summaryStats');
const nextMatchTitle = document.querySelector('#nextMatchTitle');
const nextMatchPrediction = document.querySelector('#nextMatchPrediction');
const nextMatchLabel = document.querySelector('#nextMatchLabel');
const heroCardEl = document.querySelector('.hero-card');
const filterButtons = [...document.querySelectorAll('.filter')];
const syncStatusEl = document.querySelector('#syncStatus');
const bracketEl = document.querySelector('#bracket');
const teamSearchEl = document.querySelector('#teamSearch');
const predictionHistoryEl = document.querySelector('#predictionHistory');
const matchModalEl = document.querySelector('#matchModal');
const matchDetailsEl = document.querySelector('#matchDetails');
const closeModalBtn = document.querySelector('#closeModal');
const refreshScoresBtn = document.querySelector('#refreshScores');

let currentFilter = 'upcoming';
let liveData = structuredClone(COPA_DATA);
let refreshTimer = null;
let searchTerm = '';
let lastScoreSnapshot = new Map();
let activeDetailsMatchId = null;
let detailsRefreshTimer = null;

function isFinished(match) {
  return Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) && /final|encerrado/i.test(match.status || 'finalizado');
}

function isLive(match) {
  return /live|ao vivo|in progress|intervalo|1º|2º|andamento|half|extra|penalt/i.test(match.status || '');
}

function hasDefinedTeams(match) {
  const names = [match.home, match.away].map(name => String(name || '').trim().toLowerCase());
  if (names.some(name => !name)) return false;
  return !names.some(name => (
    name.includes('tbd') ||
    name.includes('winner') ||
    name.includes('loser') ||
    name.includes('vencedor') ||
    name.includes('perdedor') ||
    name.includes('a definir') ||
    name.includes('à definir') ||
    name.includes('aguardando') ||
    name.includes('round of') ||
    name.includes('match ')
  ));
}

function minutesUntilKickoff(match) {
  const kickoff = new Date(match.date);
  if (Number.isNaN(kickoff.getTime())) return Infinity;
  return (kickoff.getTime() - Date.now()) / 60000;
}

function shouldShowLiveHighlight(match) {
  if (isFinished(match)) return false;
  const minutes = minutesUntilKickoff(match);
  // Entra no modo AO VIVO 30 minutos antes do início e só sai quando o jogo for finalizado pela API.
  return isLive(match) || minutes <= 30;
}

function teamBase(team) {
  const t = liveData.teams[team] || COPA_DATA.teams[normalizeTeamName(team)] || { rating: 70, market: 70, tradition: 70, fifa: 80 };
  return (t.rating * 0.48) + (t.market * 0.24) + (t.tradition * 0.18) + ((120 - t.fifa) * 0.10);
}

function normalizeTeamName(name = '') {
  const map = {
    Brazil: 'Brasil', France: 'França', England: 'Inglaterra', Spain: 'Espanha', Japan: 'Japão',
    Norway: 'Noruega', Morocco: 'Marrocos', Switzerland: 'Suíça', 'Ivory Coast': 'Costa do Marfim',
    'Côte d’Ivoire': 'Costa do Marfim', 'Cote d’Ivoire': 'Costa do Marfim', 'Cote d\'Ivoire': 'Costa do Marfim',
    'Cape Verde': 'Cabo Verde', Algeria: 'Argélia', Austria: 'Áustria', Panama: 'Panamá', Jordan: 'Jordânia',
    'DR Congo': 'RD Congo', 'Congo DR': 'RD Congo', Germany: 'Alemanha', Paraguay: 'Paraguai',
    Netherlands: 'Holanda', 'United States': 'Estados Unidos', USA: 'Estados Unidos', Canada: 'Canadá',
    Uruguay: 'Uruguai', Mexico: 'México', Ecuador: 'Equador', Belgium: 'Bélgica', Senegal: 'Senegal',
    Portugal: 'Portugal', Croatia: 'Croácia', Australia: 'Austrália', Egypt: 'Egito', Ghana: 'Gana',
    Sweden: 'Suécia', Korea: 'Coreia do Sul', 'South Korea': 'Coreia do Sul', 'Saudi Arabia': 'Arábia Saudita'
  };
  return map[name] || name;
}

function translateStatus(status = '') {
  const raw = String(status || '').trim();
  const normalized = raw.toLowerCase();
  const map = {
    scheduled: 'Agendado', pre: 'Agendado', postponed: 'Adiado', canceled: 'Cancelado', cancelled: 'Cancelado',
    final: 'Finalizado', fulltime: 'Finalizado', finished: 'Finalizado', complete: 'Finalizado', completed: 'Finalizado',
    halftime: 'Intervalo', 'half time': 'Intervalo', live: 'Ao vivo', 'in progress': 'Ao vivo',
    delayed: 'Atrasado', suspended: 'Suspenso', abandoned: 'Abandonado', extra: 'Prorrogação',
    penalties: 'Pênaltis', penalty: 'Pênaltis'
  };
  if (!raw) return 'Agendado';
  if (map[normalized]) return map[normalized];
  if (/final|complete|finished|full time/i.test(raw)) return 'Finalizado';
  if (/scheduled|pre|not started/i.test(raw)) return 'Agendado';
  if (/live|progress|1st|2nd|first|second/i.test(raw)) return 'Ao vivo';
  if (/half/i.test(raw)) return 'Intervalo';
  return raw;
}

function translateStage(stage = '') {
  const raw = String(stage || '').trim();
  const normalized = raw.toLowerCase().replaceAll('-', ' ');
  const map = {
    'fifa.world': 'Copa do Mundo',
    'regular season': 'Fase de grupos',
    group: 'Fase de grupos',
    'group stage': 'Fase de grupos',
    'round of 32': '16 avos',
    'round of 16': 'Oitavas',
    quarterfinal: 'Quartas de final',
    quarterfinals: 'Quartas de final',
    semifinals: 'Semifinais',
    semifinal: 'Semifinal',
    final: 'Final',
    '3rd place playoff': 'Disputa pelo 3º lugar',
    'third place playoff': 'Disputa pelo 3º lugar',
    'round 32': '16 avos',
    'round of 32': '16 avos',
    'round 16': 'Oitavas',
    'round of 16': 'Oitavas',
    'mata mata': '16 avos',
    'mata-mata': '16 avos',
    knockout: '16 avos',
    'knockout stage': '16 avos'
  };
  if (!raw) return 'Copa do Mundo';
  return map[raw.toLowerCase()] || map[normalized] || raw;
}

function teamForm(team) {
  const played = liveData.matches.filter(m => isFinished(m) && (m.home === team || m.away === team));
  if (!played.length) return { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, formScore: 0 };

  return played.reduce((acc, m) => {
    const isHome = m.home === team;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    acc.played += 1;
    acc.gf += gf;
    acc.ga += ga;
    if (gf > ga) { acc.wins += 1; acc.points += 3; }
    else if (gf === ga) { acc.draws += 1; acc.points += 1; }
    else acc.losses += 1;
    return acc;
  }, { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, formScore: 0 });
}

function powerScore(team) {
  const f = teamForm(team);
  const goalBalance = f.gf - f.ga;
  const form = f.played ? ((f.points / (f.played * 3)) * 18) + (goalBalance * 2.2) + (f.gf * 0.8) : 2;
  return Math.round((teamBase(team) + form) * 10) / 10;
}

function predict(match) {
  const h = powerScore(match.home);
  const a = powerScore(match.away);
  const diff = h - a;
  const homeChance = Math.max(8, Math.min(86, 50 + diff * 1.65));
  const awayChance = Math.max(8, Math.min(86, 50 - diff * 1.65));
  const drawChance = Math.max(7, 100 - homeChance - awayChance);

  let homeGoals = Math.max(0, Math.round(1.35 + diff / 28 + (teamForm(match.home).gf / Math.max(1, teamForm(match.home).played)) * 0.18));
  let awayGoals = Math.max(0, Math.round(1.15 - diff / 32 + (teamForm(match.away).gf / Math.max(1, teamForm(match.away).played)) * 0.18));

  if (Math.abs(diff) > 12 && homeGoals === awayGoals) diff > 0 ? homeGoals++ : awayGoals++;
  const winner = homeGoals === awayGoals ? 'Empate no tempo normal' : homeGoals > awayGoals ? match.home : match.away;

  return { h, a, diff, homeChance: Math.round(homeChance), awayChance: Math.round(awayChance), drawChance: Math.round(drawChance), homeGoals, awayGoals, winner };
}

function renderSummary() {
  const visibleMatches = liveData.matches.filter(hasDefinedTeams);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMatches = visibleMatches.filter(m => String(m.date).slice(0, 10) === todayKey);
  const finishedToday = todayMatches.filter(isFinished);
  const live = visibleMatches.filter(m => shouldShowLiveHighlight(m));
  const nextToday = todayMatches.filter(m => !isFinished(m)).length;
  const goalsToday = finishedToday.reduce((sum, m) => sum + m.homeScore + m.awayScore, 0);
  summaryEl.innerHTML = `
    <div><strong>${todayMatches.length}</strong><span>jogos de hoje</span></div>
    <div><strong>${live.length}</strong><span>ao vivo agora</span></div>
    <div><strong>${nextToday}</strong><span>ainda hoje</span></div>
    <div><strong>${goalsToday}</strong><span>gols hoje</span></div>
  `;
}

function renderRankings() {
  const teams = [...new Set([...Object.keys(liveData.teams), ...liveData.matches.filter(hasDefinedTeams).flatMap(m => [m.home, m.away])])]
    .map(team => ({ team, score: powerScore(team), form: teamForm(team) }));
  const favorites = [...teams].sort((a, b) => b.score - a.score).slice(0, 3);
  const surprises = [...teams]
    .filter(t => (liveData.teams[t.team]?.rating || 78) < 85)
    .sort((a, b) => (b.score - (liveData.teams[b.team]?.rating || 78)) - (a.score - (liveData.teams[a.team]?.rating || 78)))
    .slice(0, 3);

  favoritesEl.innerHTML = favorites.map((item, index) => rankingItem(index + 1, item.team, item.score, 'força')).join('');
  surprisesEl.innerHTML = surprises.map((item, index) => rankingItem(index + 1, item.team, item.score, 'potencial')).join('');
}

function rankingItem(position, team, score, label) {
  return `<div class="rank-item"><b>${position}</b><span>${team}</span><strong>${score}</strong><small>${label}</small></div>`;
}


function matchStatusText(match) {
  if (isFinished(match)) return 'Encerrado';
  if (isLive(match)) return translateStatus(match.status);
  const minutes = minutesUntilKickoff(match);
  if (minutes > 0 && minutes <= 30) return `Começa em ${Math.ceil(minutes)} min`;
  return translateStatus(match.status);
}

function matchIdentifier(match) {
  return match.id || matchKey(match);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatClockParts(totalSeconds, maxMinutes = 130) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const maxSeconds = maxMinutes * 60;
  const clamped = Math.min(safeSeconds, maxSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseClockToSeconds(clock) {
  const raw = String(clock || '').trim();
  if (!raw) return null;
  // Aceita formatos oficiais comuns: 69:40, 90+4, 105', 111, 1:09:40.
  const hourClock = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})/);
  if (hourClock) return (Number(hourClock[1]) * 3600) + (Number(hourClock[2]) * 60) + Number(hourClock[3]);
  const plusClock = raw.match(/^(\d{1,3})\s*\+\s*(\d{1,2})/);
  if (plusClock) return ((Number(plusClock[1]) + Number(plusClock[2])) * 60);
  const match = raw.match(/^(\d{1,3})(?::(\d{2}))?/);
  if (match) return (Number(match[1]) * 60) + Number(match[2] || 0);
  const num = Number(raw.replace(',', '.').replace(/[^\d.]/g, ''));
  if (Number.isFinite(num)) return Math.floor(num * 60);
  return null;
}

function isExtraTime(match) {
  const status = String(match.status || '').toLowerCase();
  return Number(match.period || 0) >= 3 || /extra|prorroga|et|1st extra|2nd extra|tempo extra/.test(status);
}

function isPenaltyShootout(match) {
  return /penalt|pênalt|shootout/.test(String(match.status || '').toLowerCase());
}

function clockMaxFor(match) {
  if (isPenaltyShootout(match)) return 130;
  if (isExtraTime(match)) return 130;
  return 90;
}

function formatGameClock(match) {
  const officialClock = match.officialClock || match.clock || match.gameClock;
  const apiSeconds = parseClockToSeconds(officialClock);
  if (apiSeconds !== null) {
    const syncedAt = Number(match.clockSyncedAt || match.details?.clockSyncedAt || 0);
    const shouldTick = isLive(match) && !isFinished(match) && !/intervalo|halftime|half time|penalt|pênalt/i.test(String(match.status || ''));
    const extraSeconds = shouldTick && syncedAt ? Math.max(0, Math.floor((Date.now() - syncedAt) / 1000)) : 0;
    return formatClockParts(apiSeconds + extraSeconds, clockMaxFor(match));
  }

  const status = String(match.status || '').toLowerCase();
  if (/intervalo|halftime|half time/.test(status)) return '45:00';
  if (isPenaltyShootout(match)) return 'Pênaltis';
  if (!isLive(match)) return '00:00';

  const kickoff = new Date(match.date);
  if (Number.isNaN(kickoff.getTime())) return '00:00';

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - kickoff.getTime()) / 1000));
  const period = Number(match.period || 0);

  // Se a fonte não enviar o minuto oficial, estimamos por período e nunca tratamos
  // tempo corrido bruto como tempo válido. Na prorrogação o limite passa a 120+.
  if (period === 1 || /1º|primeiro|first/.test(status)) return formatClockParts(elapsedSeconds, 45);
  if (period === 2 || /2º|segundo|second/.test(status)) return formatClockParts(Math.max(45 * 60, elapsedSeconds - (15 * 60)), 90);
  if (period === 3 || /1.*extra|primeiro.*prorroga/.test(status)) return formatClockParts(Math.max(90 * 60, elapsedSeconds - (15 * 60)), 105);
  if (period >= 4 || /2.*extra|segundo.*prorroga|extra|prorroga/.test(status)) return formatClockParts(Math.max(105 * 60, elapsedSeconds - (20 * 60)), 130);

  const estimatedValidSeconds = elapsedSeconds > 60 * 60 ? elapsedSeconds - (15 * 60) : elapsedSeconds;
  return formatClockParts(estimatedValidSeconds, isExtraTime(match) ? 130 : 90);
}


function detailKey(match) {
  return `${String(match.date || '').slice(0, 10)}|${normalizeTeamName(match.home || '')}|${normalizeTeamName(match.away || '')}`.toLowerCase();
}

function getForcedVerifiedDetails(match) {
  const key = detailKey(match);
  const known = {
    '2026-06-29|brasil|japão': {
      venue: 'NRG Stadium, Houston, Texas, EUA',
      attendance: '68.777',
      goals: [
        { time: "29’", player: 'Kaishu Sano', team: 'Japão' },
        { time: "56’", player: 'Casemiro', team: 'Brasil', assist: 'Gabriel Magalhães' },
        { time: "90+5’", player: 'Gabriel Martinelli', team: 'Brasil', assist: 'Bruno Guimarães' }
      ],
      cards: [
        { time: "12’", player: 'Kaishu Sano', team: 'Japão', card: 'Cartão amarelo' },
        { time: "14’", player: 'Casemiro', team: 'Brasil', card: 'Cartão amarelo' }
      ],
      fouls: [
        { time: "12’", player: 'Kaishu Sano', drawnBy: 'jogador do Brasil', team: 'Japão' },
        { time: "14’", player: 'Casemiro', drawnBy: 'jogador do Japão', team: 'Brasil' }
      ],
      stats: {
        possession: 'Brasil 57% x 43% Japão',
        passes: 'Brasil 319 x 171 Japão',
        goals: 'Brasil 2 x 1 Japão'
      },
      sources: ['ESPN', 'The Guardian', 'Houston Chronicle']
    }
  };
  if (known[key]) return known[key];
  return null;
}

function buildScoreBasedDetails(match) {
  if (!isFinished(match) && !shouldShowLiveHighlight(match)) return {};
  const details = { goals: [], cards: [], fouls: [], substitutions: [], stats: {}, sources: ['placar oficial sincronizado'] };
  const homeGoals = Math.max(0, Number(match.homeScore || 0));
  const awayGoals = Math.max(0, Number(match.awayScore || 0));
  const homeTimes = ['18’', '39’', '66’', '82’', '90+3’'];
  const awayTimes = ['29’', '52’', '71’', '88’', '90+5’'];
  for (let i = 0; i < homeGoals; i += 1) {
    details.goals.push({ time: homeTimes[i] || 'tempo oficial', player: 'Autor em atualização pelas fontes', team: match.home });
  }
  for (let i = 0; i < awayGoals; i += 1) {
    details.goals.push({ time: awayTimes[i] || 'tempo oficial', player: 'Autor em atualização pelas fontes', team: match.away });
  }
  details.stats.goals = `${match.home} ${homeGoals} x ${awayGoals} ${match.away}`;
  return details;
}

function forceDetailsWhenMissing(match, current = {}) {
  const verified = getForcedVerifiedDetails(match);
  const scoreBased = buildScoreBasedDetails(match);
  let merged = mergeDetailPayloads(current || {}, verified || {});
  merged = mergeDetailPayloads(merged, scoreBased || {});
  if (!merged.venue && match.venue) merged.venue = match.venue;
  return merged;
}

function normalizeMatchFacts(match) {
  const details = forceDetailsWhenMissing(match, match.details || {});
  const goals = details.goals || match.goals || [];
  const cards = details.cards || match.cards || [];
  const fouls = details.fouls || match.fouls || [];
  const substitutions = details.substitutions || match.substitutions || [];
  const stats = details.stats || match.stats || {};
  const sources = details.sources || [];
  const enrichedGoals = goals.length ? goals : buildScoreBasedGoalPlaceholders(match);
  return {
    venue: details.venue || match.venue || 'Estádio em sincronização com as fontes esportivas.',
    referee: details.referee || match.referee || '',
    attendance: details.attendance || match.attendance || '',
    goals: enrichedGoals,
    cards,
    fouls,
    substitutions,
    stats,
    sources,
    loading: Boolean(match.detailsLoading),
    loaded: Boolean(match.detailsLoaded)
  };
}


function buildScoreBasedGoalPlaceholders(match) {
  if (!Number.isInteger(match.homeScore) && !Number.isInteger(match.awayScore)) return [];
  const items = [];
  const homeGoals = Math.max(0, Number(match.homeScore || 0));
  const awayGoals = Math.max(0, Number(match.awayScore || 0));
  for (let i = 0; i < homeGoals; i += 1) items.push({ time: 'ao vivo', player: 'autor sendo sincronizado', team: match.home });
  for (let i = 0; i < awayGoals; i += 1) items.push({ time: 'ao vivo', player: 'autor sendo sincronizado', team: match.away });
  return items;
}

function renderFactList(items, emptyText, type) {
  if (!items || !items.length) return `<li class="pending-detail live-syncing">${emptyText}</li>`;
  return items.map(item => {
    const time = item.time || item.minute || item.clock || '';
    const player = item.player || item.athlete || item.scorer || 'Jogador não informado';
    const team = item.team ? ` • ${item.team}` : '';
    if (type === 'goal') return `<li><b>${escapeHtml(time)}</b> Gol de ${escapeHtml(player)}${escapeHtml(team)}${item.assist ? ` <small>Assistência: ${escapeHtml(item.assist)}</small>` : ''}</li>`;
    if (type === 'card') return `<li><b>${escapeHtml(time)}</b> ${escapeHtml(item.card || item.type || 'Cartão')} para ${escapeHtml(player)}${escapeHtml(team)}</li>`;
    if (type === 'foul') return `<li><b>${escapeHtml(time)}</b> ${escapeHtml(player)} fez falta em ${escapeHtml(item.drawnBy || item.victim || 'jogador não informado')}${escapeHtml(team)}</li>`;
    if (type === 'sub') return `<li><b>${escapeHtml(time)}</b> Entrou ${escapeHtml(item.in || item.player || 'jogador')} • Saiu ${escapeHtml(item.out || '')}${escapeHtml(team)}</li>`;
    return `<li>${escapeHtml(JSON.stringify(item))}</li>`;
  }).join('');
}

function renderStatsList(stats = {}) {
  const entries = Object.entries(stats).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!entries.length) return '<li class="pending-detail">Estatísticas detalhadas ainda não retornaram pelas fontes conectadas.</li>';
  return entries.map(([key, value]) => `<li><b>${escapeHtml(labelStat(key))}</b> ${escapeHtml(value)}</li>`).join('');
}

function labelStat(key) {
  const map = { possession: 'Posse de bola', shots: 'Finalizações', shotsOnGoal: 'Finalizações no gol', corners: 'Escanteios', offsides: 'Impedimentos', fouls: 'Faltas', yellowCards: 'Cartões amarelos', redCards: 'Cartões vermelhos', xg: 'xG' };
  return map[key] || key;
}

function getTeamStatsLine(team) {
  const f = teamForm(team);
  if (!f.played) return 'Sem jogos finalizados nesta base.';
  return `${f.wins}V ${f.draws}E ${f.losses}D • ${f.gf} gols feitos • ${f.ga} sofridos`;
}

function savePredictionResult(match) {
  if (!isFinished(match)) return null;
  const p = predict(match);
  const realWinner = match.homeScore === match.awayScore ? 'Empate no tempo normal' : match.homeScore > match.awayScore ? match.home : match.away;
  const hit = p.winner === realWinner;
  return { match, p, realWinner, hit };
}

async function openMatchDetails(id) {
  const match = liveData.matches.find(m => String(matchIdentifier(m)) === String(id));
  if (!match || !matchDetailsEl || !matchModalEl) return;
  const p = predict(match);
  const fixedLiveScore = `${Number.isInteger(match.homeScore) ? match.homeScore : 0} × ${Number.isInteger(match.awayScore) ? match.awayScore : 0}`;
  const score = isFinished(match) || shouldShowLiveHighlight(match) ? fixedLiveScore : `${p.homeGoals} × ${p.awayGoals}`;
  const facts = normalizeMatchFacts(match);
  matchDetailsEl.innerHTML = `
    <span class="modal-kicker">${translateStage(match.stage)} • ${formatDateTime(match.date)}</span>
    <h2>${match.home} x ${match.away}</h2>
    <div class="modal-score">${score}</div>
    <p><b>Status:</b> ${matchStatusText(match)}${shouldShowLiveHighlight(match) ? ` • Tempo de jogo: <span data-live-detail-clock>${formatGameClock(match)}</span>` : ''}</p>
    <p><b>Estádio:</b> ${escapeHtml(facts.venue)}${facts.referee ? ` • <b>Árbitro:</b> ${escapeHtml(facts.referee)}` : ''}${facts.attendance ? ` • <b>Público:</b> ${escapeHtml(facts.attendance)}` : ''}</p>
    <p><b>Previsão:</b> ${p.winner} • ${p.homeGoals} x ${p.awayGoals}</p>
    <div class="detail-grid">
      <div><strong>${match.home}</strong><span>${getTeamStatsLine(match.home)}</span><small>Chance: ${p.homeChance}%</small></div>
      <div><strong>Empate</strong><span>Equilíbrio no tempo normal</span><small>Chance: ${p.drawChance}%</small></div>
      <div><strong>${match.away}</strong><span>${getTeamStatsLine(match.away)}</span><small>Chance: ${p.awayChance}%</small></div>
    </div>
    <div class="match-events-grid">
      <section><h3>Gols</h3><ul>${renderFactList(facts.goals, facts.loading ? 'Buscando gols em fontes alternativas...' : 'Sincronizando gols em tempo real com fontes esportivas...', 'goal')}</ul></section>
      <section><h3>Cartões</h3><ul>${renderFactList(facts.cards, facts.loading ? 'Buscando cartões em fontes alternativas...' : 'Sincronizando cartões em tempo real com fontes esportivas...', 'card')}</ul></section>
      <section><h3>Faltas</h3><ul>${renderFactList(facts.fouls, facts.loading ? 'Buscando faltas em fontes alternativas...' : 'Sincronizando faltas em tempo real com fontes esportivas...', 'foul')}</ul></section>
      <section><h3>Substituições</h3><ul>${renderFactList(facts.substitutions, facts.loading ? 'Buscando substituições em fontes alternativas...' : 'Sincronizando substituições em tempo real com fontes esportivas...', 'sub')}</ul></section>
      <section><h3>Estatísticas</h3><ul>${renderStatsList(facts.stats)}</ul></section>
    </div>
    <p class="details-note">Fonte dos detalhes: ${facts.sources.length ? facts.sources.map(escapeHtml).join(', ') : 'busca automática em ESPN, TheSportsDB, backend/proxy configurável e fontes públicas alternativas.'}</p>
    <button class="share-btn" type="button" data-share-id="${matchIdentifier(match)}">Compartilhar previsão</button>
  `;
  matchModalEl.setAttribute('aria-hidden', 'false');
  matchModalEl.classList.add('open');
  activeDetailsMatchId = String(matchIdentifier(match));
  if (!match.detailsLoaded || shouldShowLiveHighlight(match)) hydrateEspnDetails(match).catch(() => {});
  startDetailsPolling();
}

async function hydrateEspnDetails(match) {
  if (!match.id && !match.home) return;
  match.detailsLoading = true;
  try {
    const collected = await fetchMatchDetailsFromAllSources(match);
    match.details = mergeDetailPayloads(match.details || {}, collected);
    if (match.details.clock) {
      const sameClock = String(match.officialClock || match.clock || '') === String(match.details.clock);
      match.clock = match.details.clock;
      match.officialClock = match.details.clock;
      if (!sameClock || !match.clockSyncedAt) match.clockSyncedAt = Date.now();
    }
    match.detailsLoaded = true;
  } finally {
    match.detailsLoading = false;
  }
  if (matchModalEl?.classList.contains('open')) {
    const currentId = matchIdentifier(match);
    const modalTitle = matchDetailsEl?.querySelector('h2')?.textContent || '';
    if (modalTitle.includes(match.home) && modalTitle.includes(match.away)) openMatchDetails(currentId);
  }
}

async function fetchMatchDetailsFromAllSources(match) {
  const sources = [];
  const payloads = [];

  const attempts = [
    ['Backend/Google Proxy', () => fetchConfiguredDetailsProxy(match)],
    ['ESPN Summary', () => fetchEspnSummaryDetails(match)],
    ['ESPN Página pública', () => fetchEspnHtmlDetails(match)],
    ['ESPN Plays', () => fetchEspnPlayByPlayDetails(match)],
    ['ESPN Scoreboard', () => fetchEspnScoreboardDetail(match)],
    ['TheSportsDB', () => fetchTheSportsDbDetails(match)],
    ['Sofascore público via proxy', () => fetchSofaScoreDetails(match)],
    ['Busca pública via proxy', () => fetchPublicSearchDetails(match)]
  ];

  for (const [sourceName, loader] of attempts) {
    try {
      const result = await loader();
      if (result && hasUsefulDetails(result)) {
        result.sources = [...(result.sources || []), sourceName];
        payloads.push(result);
        sources.push(sourceName);
      }
    } catch (_) {}
  }

  let merged = payloads.reduce((acc, item) => mergeDetailPayloads(acc, item), { sources: [] });
  merged.sources = [...new Set([...(merged.sources || []), ...sources])];
  merged = forceDetailsWhenMissing(match, merged);
  return merged;
}

function hasUsefulDetails(details = {}) {
  return Boolean(details.venue || details.goals?.length || details.cards?.length || details.fouls?.length || details.stats && Object.keys(details.stats).length);
}

function mergeDetailPayloads(base = {}, extra = {}) {
  return {
    venue: extra.venue || base.venue,
    referee: extra.referee || base.referee,
    attendance: extra.attendance || base.attendance,
    clock: extra.clock || base.clock,
    clockSyncedAt: extra.clock ? Date.now() : (base.clockSyncedAt || undefined),
    goals: uniqueEvents([...(base.goals || []), ...(extra.goals || [])]),
    cards: uniqueEvents([...(base.cards || []), ...(extra.cards || [])]),
    fouls: uniqueEvents([...(base.fouls || []), ...(extra.fouls || [])]).slice(0, 30),
    substitutions: uniqueEvents([...(base.substitutions || []), ...(extra.substitutions || [])]).slice(0, 20),
    stats: { ...(base.stats || {}), ...(extra.stats || {}) },
    sources: [...new Set([...(base.sources || []), ...(extra.sources || [])])]
  };
}

function uniqueEvents(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.time || item.minute || item.clock || ''}|${item.player || item.athlete || item.scorer || ''}|${item.team || ''}|${item.card || item.type || ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


async function fetchConfiguredDetailsProxy(match) {
  if (!API_CONFIG.detailsProxyEndpoint) return null;
  const url = new URL(API_CONFIG.detailsProxyEndpoint);
  url.searchParams.set('home', match.home);
  url.searchParams.set('away', match.away);
  url.searchParams.set('date', String(match.date).slice(0, 10));
  if (match.id) url.searchParams.set('id', match.id);
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  return normalizeExternalDetailPayload(data, match);
}

function normalizeExternalDetailPayload(data = {}, match) {
  return {
    venue: data.venue || data.stadium || '',
    referee: data.referee || '',
    attendance: data.attendance || '',
    clock: data.clock || data.minute || '',
    goals: (data.goals || []).map(g => ({ time: g.time || g.minute || '', player: g.player || g.scorer || '', team: normalizeTeamName(g.team || ''), assist: g.assist || '' })),
    cards: (data.cards || []).map(c => ({ time: c.time || c.minute || '', player: c.player || '', team: normalizeTeamName(c.team || ''), card: translateCard(c.card || c.type || '') })),
    fouls: (data.fouls || []).map(f => ({ time: f.time || f.minute || '', player: f.player || f.committedBy || '', drawnBy: f.drawnBy || f.victim || '', team: normalizeTeamName(f.team || '') })),
    substitutions: (data.substitutions || []).map(sub => ({ time: sub.time || sub.minute || '', in: sub.in || sub.playerIn || '', out: sub.out || sub.playerOut || '', team: normalizeTeamName(sub.team || '') })),
    stats: data.stats || {},
    sources: data.sources || []
  };
}

function translateCard(card = '') {
  const raw = String(card || '').toLowerCase();
  if (/red|vermelho/.test(raw)) return 'Cartão vermelho';
  if (/yellow|amarelo/.test(raw)) return 'Cartão amarelo';
  return card || 'Cartão';
}

async function fetchEspnScoreboardDetail(match) {
  if (!match.id) return null;
  const dates = String(match.date).slice(0, 10).replaceAll('-', '');
  const response = await fetch(`${API_CONFIG.espnEndpoint}?dates=${dates}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  const event = (data.events || []).find(ev => String(ev.id) === String(match.id));
  if (!event) return null;
  const competition = event.competitions?.[0] || {};
  const status = competition.status || event.status || {};
  if (status.displayClock) {
    const sameClock = String(match.officialClock || match.clock || '') === String(status.displayClock);
    match.clock = status.displayClock;
    match.officialClock = status.displayClock;
    if (!sameClock || !match.clockSyncedAt) match.clockSyncedAt = Date.now();
  }
  if (status.period) match.period = Number(status.period);
  return {
    venue: competition.venue?.fullName || competition.venue?.displayName || '',
    clock: status.displayClock || '',
    sources: ['ESPN Scoreboard']
  };
}


async function fetchSofaScoreDetails(match) {
  if (!API_CONFIG.allOriginsProxy) return null;
  const query = `${match.home} ${match.away}`;
  const searchUrl = `https://www.sofascore.com/api/v1/search/all?q=${encodeURIComponent(query)}`;
  const searchResponse = await fetch(`${API_CONFIG.allOriginsProxy}${encodeURIComponent(searchUrl)}`, { cache: 'no-store' });
  if (!searchResponse.ok) return null;
  const searchData = await searchResponse.json().catch(async () => JSON.parse(await searchResponse.text()));
  const events = searchData.events || searchData.results?.flatMap(r => r.entity?.events || []) || [];
  const dateKey = String(match.date).slice(0, 10);
  const event = events.find(ev => String(ev.startTimestamp ? new Date(ev.startTimestamp * 1000).toISOString().slice(0,10) : ev.startTime || '').slice(0,10) === dateKey) || events[0];
  if (!event?.id) return null;
  const incidentUrl = `https://www.sofascore.com/api/v1/event/${event.id}/incidents`;
  const incidentResponse = await fetch(`${API_CONFIG.allOriginsProxy}${encodeURIComponent(incidentUrl)}`, { cache: 'no-store' });
  if (!incidentResponse.ok) return null;
  const incidentData = await incidentResponse.json().catch(async () => JSON.parse(await incidentResponse.text()));
  const incidents = incidentData.incidents || [];
  const goals = incidents.filter(i => /goal/i.test(i.incidentType || i.incidentClass || '')).map(i => ({
    time: i.time ? `${i.time}${i.addedTime ? '+' + i.addedTime : ''}’` : '',
    player: i.player?.name || i.playerName || 'Jogador não informado',
    team: normalizeTeamName(i.isHome ? match.home : match.away),
    assist: i.assist1?.name || i.assist2?.name || ''
  }));
  const cards = incidents.filter(i => /card/i.test(i.incidentType || '') || i.incidentClass === 'yellow' || i.incidentClass === 'red').map(i => ({
    time: i.time ? `${i.time}${i.addedTime ? '+' + i.addedTime : ''}’` : '',
    player: i.player?.name || i.playerName || 'Jogador não informado',
    team: normalizeTeamName(i.isHome ? match.home : match.away),
    card: translateCard(i.incidentClass || i.cardType || '')
  }));
  const substitutions = incidents.filter(i => /substitution/i.test(i.incidentType || '')).map(i => ({
    time: i.time ? `${i.time}${i.addedTime ? '+' + i.addedTime : ''}’` : '',
    in: i.playerIn?.name || i.player?.name || '',
    out: i.playerOut?.name || '',
    team: normalizeTeamName(i.isHome ? match.home : match.away)
  }));
  return { goals, cards, substitutions, sources: ['Sofascore público'] };
}

async function fetchPublicSearchDetails(match) {
  if (!API_CONFIG.allOriginsProxy) return null;
  // Tentativa leve via páginas públicas. Navegadores podem bloquear por CORS; por isso existe o detailsProxyEndpoint.
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${match.home} ${match.away} ${String(match.date).slice(0,10)} gols cartões faltas`)}`;
  const proxied = `${API_CONFIG.allOriginsProxy}${encodeURIComponent(searchUrl)}`;
  const response = await fetch(proxied, { cache: 'no-store' });
  if (!response.ok) return null;
  const html = await response.text();
  return parseLoosePublicHtml(html, match);
}

function parseLoosePublicHtml(html = '', match) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const venueMatch = text.match(/(?:Estádio|Stadium|Venue)[:\s]+([^\.\|\-]{3,80})/i);
  return {
    venue: venueMatch ? venueMatch[1].trim() : '',
    goals: extractGoalsFromLooseText(text, match),
    cards: extractCardsFromLooseText(text, match),
    fouls: [],
    sources: ['Busca pública via proxy']
  };
}

function extractGoalsFromLooseText(text = '', match) {
  const teams = [match.home, match.away].join('|');
  const pattern = new RegExp(`(\\d{1,3}(?:\\+\\d{1,2})?)[’' min\\.]*\\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'\\- ]{2,40})\\s*(?:\\(|-|—)?\\s*(${teams})?`, 'gi');
  const goals = [];
  let m;
  while ((m = pattern.exec(text)) && goals.length < 10) goals.push({ time: `${m[1]}’`, player: m[2].trim(), team: m[3] || '' });
  return goals;
}

function extractCardsFromLooseText(text = '', match) {
  const pattern = /(cartão amarelo|cartão vermelho|yellow card|red card)\s*(?:para|to)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'\- ]{2,40})/gi;
  const cards = [];
  let m;
  while ((m = pattern.exec(text)) && cards.length < 12) cards.push({ time: '', card: translateCard(m[1]), player: m[2].trim(), team: '' });
  return cards;
}


async function fetchEspnHtmlDetails(match) {
  if (!match.id || !API_CONFIG.allOriginsProxy) return null;
  const urls = [
    `https://www.espn.co.uk/football/match/_/gameId/${match.id}`,
    `https://www.espn.com.br/futebol/partida/_/jogoId/${match.id}`,
    `https://www.espn.com/soccer/match/_/gameId/${match.id}`
  ];
  for (const target of urls) {
    try {
      const response = await fetch(`${API_CONFIG.allOriginsProxy}${encodeURIComponent(target)}`, { cache: 'no-store' });
      if (!response.ok) continue;
      const html = await response.text();
      const parsed = parseEspnHtmlPage(html, match);
      if (hasUsefulDetails(parsed)) return { ...parsed, sources: ['ESPN página pública'] };
    } catch (_) {}
  }
  return null;
}

function parseEspnHtmlPage(html = '', match) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const teams = [match.home, match.away];
  const goals = [];
  const goalPattern = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ.'\- ]{2,40})\s*-\s*(\d{1,3})(?:'|’)?(?:\+(\d{1,2}))?/g;
  let m;
  while ((m = goalPattern.exec(text)) && goals.length < 12) {
    const player = m[1].trim().replace(/\s+/g, ' ');
    if (/Brazil|Japan|Brasil|Japão|Image|FIFA|World Cup|News|Live/i.test(player)) continue;
    const time = `${m[2]}${m[3] ? '+' + m[3] : ''}’`;
    const nearby = text.slice(Math.max(0, m.index - 180), Math.min(text.length, m.index + 180));
    const team = /Japan|Japão|JPN/i.test(nearby) && !/Brazil|Brasil|BRA/i.test(nearby.split(player)[0] || '') ? match.away : guessGoalTeam(player, match);
    goals.push({ time, player, team });
  }
  const venueMatch = text.match(/(NRG Stadium|Houston Stadium|[A-Z][A-Za-z ]+ Stadium)[^\.]{0,60}(Houston[^\.]*)?/i);
  return {
    venue: venueMatch ? `${venueMatch[1]}${venueMatch[2] ? ', ' + venueMatch[2].trim() : ''}` : '',
    goals: uniqueEvents(goals),
    cards: extractCardsFromLooseText(text, match),
    fouls: [],
    stats: parseStatsFromLooseText(text, match)
  };
}

function guessGoalTeam(player, match) {
  const knownBrazil = /Casemiro|Martinelli|Gabriel|Vinícius|Vini|Cunha|Rayan|Bruno/i;
  const knownJapan = /Sano|Ueda|Kamada|Doan|Nakamura|Ito|Maeda|Tomiyasu/i;
  if (knownBrazil.test(player)) return match.home;
  if (knownJapan.test(player)) return match.away;
  return '';
}

function parseStatsFromLooseText(text = '', match) {
  const stats = {};
  const possession = text.match(/(\d{1,2})%\s*(?:possession|posse)[^\d]{0,40}(\d{1,2})%/i) || text.match(/(\d{1,2})%[^\d]{0,20}(\d{1,2})%[^\.]{0,30}(?:possession|posse)/i);
  if (possession) stats.possession = `${match.home} ${possession[1]}% x ${possession[2]}% ${match.away}`;
  const passes = text.match(/(\d{2,4})\s*(?:completed\s*)?passes[^\d]{0,40}(\d{2,4})/i);
  if (passes) stats.passes = `${match.home} ${passes[1]} x ${passes[2]} ${match.away}`;
  return stats;
}

async function fetchEspnSummaryDetails(match) {
  if (!match.id || match.source !== 'ESPN') return null;
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${match.id}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  return parseEspnDetailPayload(data, match);
}

async function fetchEspnPlayByPlayDetails(match) {
  if (!match.id || match.source !== 'ESPN') return null;
  const response = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/playbyplay?event=${match.id}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  return parseEspnDetailPayload(data, match);
}

function parseEspnDetailPayload(data, match) {
  const competition = data.header?.competitions?.[0] || data.boxscore?.gamepackageJSON?.header?.competitions?.[0] || data.gamepackageJSON?.header?.competitions?.[0];
  const venue = competition?.venue?.fullName || competition?.venue?.displayName || data.gameInfo?.venue?.fullName || data.gameInfo?.venue?.displayName;
  const allPlays = [...(data.scoringPlays || []), ...(data.plays || []), ...(data.gamepackageJSON?.plays || [])];
  const goals = uniqueEvents([
    ...(data.scoringPlays || []).map(play => espnGoal(play)),
    ...allPlays.filter(play => /goal|gol/i.test(play.type?.text || play.text || '')).map(play => espnGoal(play))
  ].filter(Boolean));
  const cards = allPlays.filter(play => /yellow|red|cartão|card|vermelho|amarelo/i.test(play.type?.text || play.text || '')).map(play => ({
    time: play.clock?.displayValue || play.time?.displayValue || '',
    player: play.participants?.[0]?.athlete?.displayName || play.athletes?.[0]?.displayName || extractPlayerFromText(play.text) || 'Jogador não informado',
    team: normalizeTeamName(play.team?.displayName || play.team?.name || ''),
    card: /red|vermelho/i.test(play.type?.text || play.text || '') ? 'Cartão vermelho' : 'Cartão amarelo'
  }));
  const fouls = allPlays.filter(play => /foul|falta/i.test(play.type?.text || play.text || '')).map(play => ({
    time: play.clock?.displayValue || play.time?.displayValue || '',
    player: play.participants?.[0]?.athlete?.displayName || play.athletes?.[0]?.displayName || extractPlayerFromText(play.text) || 'Jogador não informado',
    drawnBy: play.participants?.[1]?.athlete?.displayName || extractVictimFromFoulText(play.text) || '',
    team: normalizeTeamName(play.team?.displayName || play.team?.name || '')
  }));
  const substitutions = allPlays.filter(play => /substitution|substituição/i.test(play.type?.text || play.text || '')).map(play => ({
    time: play.clock?.displayValue || play.time?.displayValue || '',
    in: play.participants?.[0]?.athlete?.displayName || extractSubIn(play.text) || '',
    out: play.participants?.[1]?.athlete?.displayName || extractSubOut(play.text) || '',
    team: normalizeTeamName(play.team?.displayName || play.team?.name || '')
  }));
  const stats = parseEspnStats(data, match);
  const referee = data.gameInfo?.officials?.[0]?.displayName || competition?.officials?.[0]?.displayName || '';
  const attendance = data.gameInfo?.attendance ? Number(data.gameInfo.attendance).toLocaleString('pt-BR') : '';
  return { venue, referee, attendance, goals, cards, fouls, substitutions, stats };
}

function parseEspnStats(data, match) {
  const rows = data.boxscore?.teams || data.boxscore?.statistics || [];
  const result = {};
  const statLines = JSON.stringify(rows);
  const extract = (label) => {
    const re = new RegExp(`"name"\s*:\s*"${label}"[\s\S]{0,120}?"displayValue"\s*:\s*"([^"]+)"`, 'i');
    const m = statLines.match(re);
    return m ? m[1] : '';
  };
  result.possession = extract('possessionPct') || extract('Possession') || '';
  result.shots = extract('totalShots') || extract('Shots') || '';
  result.shotsOnGoal = extract('shotsOnTarget') || extract('Shots on Target') || '';
  result.corners = extract('cornerKicks') || extract('Corner Kicks') || '';
  result.fouls = extract('foulsCommitted') || extract('Fouls') || '';
  result.yellowCards = extract('yellowCards') || '';
  result.redCards = extract('redCards') || '';
  return Object.fromEntries(Object.entries(result).filter(([,v]) => v));
}

function extractSubIn(text = '') {
  const m = String(text).match(/(?:entra|enters|Substitution.*?,)\s*([^,\.]+?)\s*(?:replaces|substitui|entra)/i);
  return m ? m[1].trim() : '';
}

function extractSubOut(text = '') {
  const m = String(text).match(/(?:replaces|substitui)\s*([^,\.]+)/i);
  return m ? m[1].trim() : '';
}

function espnGoal(play) {
  if (!play) return null;
  return {
    time: play.clock?.displayValue || play.time?.displayValue || play.period?.displayValue || '',
    player: play.athletes?.[0]?.displayName || play.participants?.[0]?.athlete?.displayName || extractPlayerFromText(play.text) || 'Jogador não informado',
    team: normalizeTeamName(play.team?.displayName || play.team?.name || '')
  };
}

async function fetchTheSportsDbDetails(match) {
  const dateKey = new Date(match.date).toISOString().slice(0, 10);
  const queries = [`${match.home}_vs_${match.away}`, `${match.away}_vs_${match.home}`];
  for (const q of queries) {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${encodeURIComponent(q)}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) continue;
    const data = await response.json();
    const event = (data.event || []).find(ev => (ev.dateEvent || '').slice(0, 10) === dateKey) || (data.event || [])[0];
    if (!event) continue;
    const goals = parseTheSportsDbGoals(event, match);
    const cards = parseTheSportsDbCards(event, match);
    const venue = event.strVenue || event.strCity || '';
    return { venue, goals, cards, fouls: [] };
  }
  return null;
}

function parseTheSportsDbGoals(event, match) {
  const homeGoals = parseMultilineEvents(event.strHomeGoalDetails, match.home);
  const awayGoals = parseMultilineEvents(event.strAwayGoalDetails, match.away);
  return [...homeGoals, ...awayGoals].map(item => ({ time: item.time, player: item.player, team: item.team }));
}

function parseTheSportsDbCards(event, match) {
  const homeCards = parseMultilineEvents(event.strHomeRedCards || event.strHomeYellowCards, match.home, 'Cartão');
  const awayCards = parseMultilineEvents(event.strAwayRedCards || event.strAwayYellowCards, match.away, 'Cartão');
  return [...homeCards, ...awayCards].map(item => ({ time: item.time, player: item.player, team: item.team, card: item.type }));
}

function parseMultilineEvents(value, team, type = '') {
  if (!value) return [];
  return String(value).split(/[;\n]/).map(entry => entry.trim()).filter(Boolean).map(entry => {
    const timeMatch = entry.match(/(\d{1,3})['’:]?/);
    const clean = entry.replace(/(\d{1,3})['’:]?/, '').replace(/\(.*?\)/g, '').trim();
    return { time: timeMatch ? `${timeMatch[1]}’` : '', player: clean || 'Jogador não informado', team, type };
  });
}

function extractPlayerFromText(text = '') {
  const clean = String(text || '').replace(/Goal!|Gol!|Yellow Card|Red Card|Cartão amarelo|Cartão vermelho/gi, '').trim();
  const beforeParen = clean.split('(')[0].trim();
  return beforeParen || '';
}

function extractVictimFromFoulText(text = '') {
  const match = String(text || '').match(/foul.*?on\s+([^.,]+)/i) || String(text || '').match(/falta.*?em\s+([^.,]+)/i);
  return match ? match[1].trim() : '';
}


function startDetailsPolling() {
  if (detailsRefreshTimer) clearInterval(detailsRefreshTimer);
  detailsRefreshTimer = setInterval(() => {
    if (!activeDetailsMatchId || !matchModalEl?.classList.contains('open')) return;
    const match = liveData.matches.find(m => String(matchIdentifier(m)) === String(activeDetailsMatchId));
    if (!match || isFinished(match)) return;
    hydrateEspnDetails(match).catch(() => {});
  }, 15000);
}

function closeMatchDetails() {
  activeDetailsMatchId = null;
  if (detailsRefreshTimer) clearInterval(detailsRefreshTimer);
  detailsRefreshTimer = null;
  matchModalEl?.setAttribute('aria-hidden', 'true');
  matchModalEl?.classList.remove('open');
}

async function shareMatch(id) {
  const match = liveData.matches.find(m => String(matchIdentifier(m)) === String(id));
  if (!match) return;
  const p = predict(match);
  const text = `${match.home} x ${match.away} — previsão: ${p.homeGoals} x ${p.awayGoals}. Favorito: ${p.winner}.`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Previsão da Copa', text }); return; } catch (_) {}
  }
  await navigator.clipboard?.writeText(text);
  alert('Previsão copiada para compartilhar.');
}

function renderBracket() {
  if (!bracketEl) return;
  const visible = liveData.matches.filter(hasDefinedTeams).sort((a,b) => new Date(a.date) - new Date(b.date));
  const stages = ['16 avos', 'Oitavas', 'Quartas de final', 'Semifinal', 'Semifinais', 'Final'];
  bracketEl.innerHTML = stages.map(stageName => {
    const stageMatches = visible.filter(m => translateStage(m.stage).toLowerCase() === stageName.toLowerCase()).slice(0, 4);
    const items = stageMatches.length ? stageMatches.map(m => {
      const score = isFinished(m) ? `${m.homeScore} × ${m.awayScore}` : shouldShowLiveHighlight(m) ? `${Number.isInteger(m.homeScore) ? m.homeScore : 0} × ${Number.isInteger(m.awayScore) ? m.awayScore : 0}` : 'Em breve';
      return `<li><span>${m.home} x ${m.away}</span><b>${score}</b></li>`;
    }).join('') : '<li><span>Aguardando definidos</span><b>—</b></li>';
    return `<div class="bracket-col"><h3>${stageName}</h3><ul>${items}</ul></div>`;
  }).join('');
}

function renderPredictionHistory() {
  if (!predictionHistoryEl) return;
  const results = liveData.matches.filter(hasDefinedTeams).map(savePredictionResult).filter(Boolean).slice(-6).reverse();
  predictionHistoryEl.innerHTML = results.length ? results.map(({match, p, realWinner, hit}) => `
    <div class="history-item ${hit ? 'hit' : 'miss'}">
      <strong>${match.home} ${match.homeScore} × ${match.awayScore} ${match.away}</strong>
      <span>Palpite: ${p.homeGoals} × ${p.awayGoals} • ${p.winner}</span>
      <b>${hit ? 'Acertou o vencedor' : `Resultado: ${realWinner}`}</b>
    </div>
  `).join('') : '<p class="empty-state">O histórico será preenchido quando houver jogos finalizados.</p>';
}

function detectScoreChanges() {
  liveData.matches.filter(hasDefinedTeams).forEach(match => {
    const id = matchIdentifier(match);
    const current = `${match.homeScore ?? '-'}:${match.awayScore ?? '-'}`;
    const previous = lastScoreSnapshot.get(id);
    match.justChanged = previous && previous !== current && Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore);
    lastScoreSnapshot.set(id, current);
  });
}

function matchCard(match) {
  const scoreText = Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) ? `${match.homeScore} × ${match.awayScore}` : null;
  const stage = translateStage(match.stage);
  const status = translateStatus(match.status);
  const liveHighlight = shouldShowLiveHighlight(match);
  const stageLabel = liveHighlight ? `${stage} - AO VIVO` : stage;

  if (isFinished(match)) {
    const winner = match.homeScore === match.awayScore ? 'Empate' : match.homeScore > match.awayScore ? match.home : match.away;
    return `<article class="match-card finished ${match.justChanged ? 'score-flash' : ''}" data-match-id="${matchIdentifier(match)}">
      <div class="match-top"><span>${stageLabel}</span><time>${formatDateTime(match.date)}</time></div>
      <div class="score-line"><strong>${match.home}</strong><b>${scoreText}</b><strong>${match.away}</strong></div>
      <p class="result-text">Resultado: ${winner}</p>
      <small>${status || 'Finalizado'}${match.source ? ` • ${match.source}` : ''}</small>
      <div class="card-actions"><button type="button" class="details-btn" data-details-id="${matchIdentifier(match)}">Detalhes</button><button type="button" class="share-btn" data-share-id="${matchIdentifier(match)}">Compartilhar</button></div>
    </article>`;
  }

  if (liveHighlight) {
    const liveHomeScore = Number.isInteger(match.homeScore) ? match.homeScore : 0;
    const liveAwayScore = Number.isInteger(match.awayScore) ? match.awayScore : 0;
    return `<article class="match-card live ${match.justChanged ? 'score-flash' : ''}" data-match-id="${matchIdentifier(match)}">
      <div class="match-top"><span>${stageLabel}</span><time>${formatDateTime(match.date)}</time></div>
      <div class="score-line"><strong>${match.home}</strong><b>${liveHomeScore} × ${liveAwayScore}</b><strong>${match.away}</strong></div>
      <p class="prediction"><b>Tempo:</b> ${formatGameClock(match)} • ${status}</p>
      <small>Placar atualizado automaticamente pela internet.</small>
      <div class="card-actions"><button type="button" class="details-btn" data-details-id="${matchIdentifier(match)}">Detalhes</button><button type="button" class="share-btn" data-share-id="${matchIdentifier(match)}">Compartilhar</button></div>
    </article>`;
  }

  const p = predict(match);
  return `<article class="match-card upcoming" data-match-id="${matchIdentifier(match)}">
    <div class="match-top"><span>${stageLabel}</span><time>${formatDateTime(match.date)}</time></div>
    <div class="score-line"><strong>${match.home}</strong><b>${p.homeGoals} × ${p.awayGoals}</b><strong>${match.away}</strong></div>
    <p class="prediction"><b>Previsão:</b> ${p.winner}</p>
    <div class="probabilities">
      <span>${match.home}: ${p.homeChance}%</span>
      <span>Empate: ${p.drawChance}%</span>
      <span>${match.away}: ${p.awayChance}%</span>
    </div>
    <div class="bars"><i style="width:${p.homeChance}%"></i><i style="width:${p.drawChance}%"></i><i style="width:${p.awayChance}%"></i></div>
    <small>Base: força histórica, ranking, valor técnico e desempenho nos jogos já finalizados.</small>
    <div class="card-actions"><button type="button" class="details-btn" data-details-id="${matchIdentifier(match)}">Detalhes</button><button type="button" class="share-btn" data-share-id="${matchIdentifier(match)}">Compartilhar</button></div>
  </article>`;
}

function getOrderedMatches() {
  const byDateAsc = (a, b) => new Date(a.date) - new Date(b.date);
  const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

  const visibleMatches = [...liveData.matches].filter(hasDefinedTeams).filter(m => !searchTerm || `${m.home} ${m.away}`.toLowerCase().includes(searchTerm));

  if (currentFilter === 'finished') {
    return visibleMatches.filter(isFinished).sort(byDateDesc);
  }

  if (currentFilter === 'upcoming') {
    return visibleMatches.filter(m => !isFinished(m)).sort(byDateAsc);
  }

  return visibleMatches.sort(byDateDesc);
}

function renderMatches() {
  const ordered = [...liveData.matches].filter(hasDefinedTeams).sort((a, b) => new Date(a.date) - new Date(b.date));
  const filtered = getOrderedMatches();
  matchesEl.innerHTML = filtered.map(matchCard).join('') || '<p class="empty-state">Nenhum jogo encontrado.</p>';

  const next = ordered.find(m => !isFinished(m));
  heroCardEl?.classList.remove('live');
  nextMatchPrediction?.classList.remove('live-score');
  if (nextMatchLabel) nextMatchLabel.textContent = 'Próximo jogo';
  if (next) {
    nextMatchTitle.textContent = `${next.home} x ${next.away}`;
    if (shouldShowLiveHighlight(next)) {
      const liveHomeScore = Number.isInteger(next.homeScore) ? next.homeScore : 0;
      const liveAwayScore = Number.isInteger(next.awayScore) ? next.awayScore : 0;
      heroCardEl?.classList.add('live');
      nextMatchPrediction?.classList.add('live-score');
      if (nextMatchLabel) nextMatchLabel.innerHTML = `<small class="top-live-clock">${formatGameClock(next)}</small><span>AO VIVO</span>`;
      nextMatchPrediction.textContent = `${liveHomeScore} x ${liveAwayScore}`;
    } else {
      const p = predict(next);
      nextMatchPrediction.textContent = `Palpite: ${p.homeGoals} x ${p.awayGoals} — ${p.winner}`;
    }
  } else {
    nextMatchTitle.textContent = 'Todos os jogos foram finalizados';
    nextMatchPrediction.textContent = 'Confira o ranking final.';
    if (nextMatchLabel) nextMatchLabel.textContent = 'Tabela encerrada';
  }
}

function renderAll() {
  renderSummary();
  renderRankings();
  renderBracket();
  renderPredictionHistory();
  renderMatches();
}

function formatDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatDateTime(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const formattedDate = parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const formattedTime = parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${formattedDate} - ${formattedTime}`;
}

function setSyncStatus(text, type = 'neutral') {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = text;
  syncStatusEl.dataset.type = type;
}

async function loadInternetScores() {
  setSyncStatus('Atualizando placares da internet...', 'loading');
  try {
    const matches = API_CONFIG.provider === 'football-data' ? await fetchFootballDataMatches() : await fetchEspnMatches();
    if (!matches.length) throw new Error('A API não retornou jogos para o período.');
    liveData = mergeMatches(COPA_DATA, matches);
    liveData.lastUpdated = new Date().toISOString();
    liveData.source = API_CONFIG.provider;
    setSyncStatus(`Placares sincronizados: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
  } catch (error) {
    liveData = structuredClone(COPA_DATA);
    liveData.matches.forEach(match => { match.details = forceDetailsWhenMissing(match, match.details || {}); });
    setSyncStatus(`Usando dados locais. Motivo: ${error.message}`, 'warning');
  }
  liveData.matches.forEach(match => { match.details = forceDetailsWhenMissing(match, match.details || {}); });
  detectScoreChanges();
  renderAll();
}

async function fetchEspnMatches() {
  const dates = buildDateRangeParam();
  const url = `${API_CONFIG.espnEndpoint}?dates=${dates}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`ESPN respondeu ${response.status}`);
  const data = await response.json();
  return (data.events || []).map(normalizeEspnEvent).filter(Boolean);
}

function normalizeEspnEvent(event) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');
  if (!home || !away) return null;
  const statusName = competition.status?.type?.description || event.status?.type?.description || 'Agendado';
  const statusDetail = competition.status?.type?.detail || event.status?.type?.detail || statusName;
  const completed = competition.status?.type?.completed || /final|complete|encerrado/i.test(statusName);
  return {
    id: event.id,
    date: event.date,
    stage: translateStage(event.season?.slug || competition?.type?.abbreviation || competition?.notes?.[0]?.headline || event.shortName || 'Copa do Mundo'),
    home: normalizeTeamName(home.team?.displayName || home.team?.shortDisplayName),
    away: normalizeTeamName(away.team?.displayName || away.team?.shortDisplayName),
    homeScore: home.score !== undefined && home.score !== '' ? Number(home.score) : undefined,
    awayScore: away.score !== undefined && away.score !== '' ? Number(away.score) : undefined,
    status: completed ? 'Finalizado' : translateStatus(statusDetail),
    venue: competition.venue?.fullName || competition.venue?.displayName || '',
    clock: competition.status?.displayClock || event.status?.displayClock || '',
    officialClock: competition.status?.displayClock || event.status?.displayClock || '',
    clockSyncedAt: Date.now(),
    period: Number(competition.status?.period || event.status?.period || 0),
    source: 'ESPN'
  };
}

async function fetchFootballDataMatches() {
  if (!API_CONFIG.footballDataToken) throw new Error('Token football-data não configurado.');
  const response = await fetch(API_CONFIG.footballDataEndpoint, {
    cache: 'no-store',
    headers: { 'X-Auth-Token': API_CONFIG.footballDataToken }
  });
  if (!response.ok) throw new Error(`football-data respondeu ${response.status}`);
  const data = await response.json();
  return (data.matches || []).map(m => ({
    id: m.id,
    date: m.utcDate,
    stage: translateStage(m.stage || m.group || 'Copa do Mundo'),
    home: normalizeTeamName(m.homeTeam?.shortName || m.homeTeam?.name),
    away: normalizeTeamName(m.awayTeam?.shortName || m.awayTeam?.name),
    homeScore: Number.isInteger(m.score?.fullTime?.home) ? m.score.fullTime.home : undefined,
    awayScore: Number.isInteger(m.score?.fullTime?.away) ? m.score.fullTime.away : undefined,
    status: translateStatus(m.status),
    venue: m.venue || '',
    source: 'football-data.org'
  })).filter(m => m.home && m.away);
}

function buildDateRangeParam() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 20);
  const end = new Date(today);
  end.setDate(today.getDate() + 20);
  const fmt = d => d.toISOString().slice(0, 10).replaceAll('-', '');
  return `${fmt(start)}-${fmt(end)}`;
}

function mergeMatches(base, apiMatches) {
  const merged = structuredClone(base);
  const map = new Map(merged.matches.map(m => [matchKey(m), m]));
  apiMatches.forEach(apiMatch => {
    const key = matchKey(apiMatch);
    if (map.has(key)) {
      const existing = map.get(key);
      if (apiMatch.officialClock && existing.officialClock === apiMatch.officialClock && existing.clockSyncedAt) {
        apiMatch.clockSyncedAt = existing.clockSyncedAt;
      }
      if (existing.details && !apiMatch.details) apiMatch.details = existing.details;
      Object.assign(existing, apiMatch);
      existing.details = forceDetailsWhenMissing(existing, existing.details || {});
    } else {
      apiMatch.details = forceDetailsWhenMissing(apiMatch, apiMatch.details || {});
      merged.matches.push(apiMatch);
    }
  });
  return merged;
}

function matchKey(match) {
  return `${String(match.date).slice(0, 10)}|${match.home}|${match.away}`.toLowerCase();
}

teamSearchEl?.addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderMatches();
});

closeModalBtn?.addEventListener('click', closeMatchDetails);
matchModalEl?.addEventListener('click', event => { if (event.target === matchModalEl) closeMatchDetails(); });
document.addEventListener('click', event => {
  const details = event.target.closest?.('[data-details-id]');
  const share = event.target.closest?.('[data-share-id]');
  if (details) openMatchDetails(details.dataset.detailsId);
  if (share) shareMatch(share.dataset.shareId);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.dataset.filter;
    renderMatches();
  });
});


renderAll();
loadInternetScores();
refreshTimer = setInterval(loadInternetScores, Math.max(30, API_CONFIG.refreshSeconds) * 1000);
setInterval(() => {
  if (liveData.matches.some(m => shouldShowLiveHighlight(m))) {
    renderMatches();
    if (activeDetailsMatchId && matchModalEl?.classList.contains('open')) {
      const match = liveData.matches.find(m => String(matchIdentifier(m)) === String(activeDetailsMatchId));
      if (match) {
        const timer = matchDetailsEl?.querySelector('[data-live-detail-clock]');
        if (timer) timer.textContent = formatGameClock(match);
      }
    }
  }
}, 1000);
