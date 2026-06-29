const matchesEl = document.querySelector('#matches');
const favoritesEl = document.querySelector('#favorites');
const surprisesEl = document.querySelector('#surprises');
const summaryEl = document.querySelector('#summaryStats');
const nextMatchTitle = document.querySelector('#nextMatchTitle');
const nextMatchPrediction = document.querySelector('#nextMatchPrediction');
const filterButtons = [...document.querySelectorAll('.filter')];
const syncStatusEl = document.querySelector('#syncStatus');
const refreshScoresBtn = document.querySelector('#refreshScores');

let currentFilter = 'all';
let liveData = structuredClone(COPA_DATA);
let refreshTimer = null;

function isFinished(match) {
  return Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) && /final|encerrado/i.test(match.status || 'finalizado');
}

function isLive(match) {
  return /live|in progress|intervalo|1º|2º|andamento/i.test(match.status || '');
}

function teamBase(team) {
  const t = liveData.teams[team] || COPA_DATA.teams[normalizeTeamName(team)] || { rating: 70, market: 70, tradition: 70, fifa: 80 };
  return (t.rating * 0.48) + (t.market * 0.24) + (t.tradition * 0.18) + ((120 - t.fifa) * 0.10);
}

function normalizeTeamName(name = '') {
  const map = {
    Brazil: 'Brasil', France: 'França', England: 'Inglaterra', Spain: 'Espanha', Japan: 'Japão',
    Norway: 'Noruega', Morocco: 'Marrocos', Switzerland: 'Suíça', 'Ivory Coast': 'Costa do Marfim',
    'Côte d’Ivoire': 'Costa do Marfim', 'Cape Verde': 'Cabo Verde'
  };
  return map[name] || name;
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
  const finished = liveData.matches.filter(isFinished);
  const upcoming = liveData.matches.filter(m => !isFinished(m));
  const live = liveData.matches.filter(isLive);
  const goals = finished.reduce((sum, m) => sum + m.homeScore + m.awayScore, 0);
  summaryEl.innerHTML = `
    <div><strong>${finished.length}</strong><span>jogos finalizados</span></div>
    <div><strong>${upcoming.length}</strong><span>próximos/ao vivo</span></div>
    <div><strong>${live.length}</strong><span>ao vivo agora</span></div>
    <div><strong>${(goals / Math.max(1, finished.length)).toFixed(1)}</strong><span>gols por jogo</span></div>
  `;
}

function renderRankings() {
  const teams = [...new Set([...Object.keys(liveData.teams), ...liveData.matches.flatMap(m => [m.home, m.away])])]
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

function matchCard(match) {
  const scoreText = Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) ? `${match.homeScore} × ${match.awayScore}` : null;

  if (isFinished(match)) {
    const winner = match.homeScore === match.awayScore ? 'Empate' : match.homeScore > match.awayScore ? match.home : match.away;
    return `<article class="match-card finished">
      <div class="match-top"><span>${match.stage}</span><time>${formatDate(match.date)}</time></div>
      <div class="score-line"><strong>${match.home}</strong><b>${scoreText}</b><strong>${match.away}</strong></div>
      <p class="result-text">Resultado: ${winner}</p>
      <small>${match.status || 'Finalizado'}${match.source ? ` • ${match.source}` : ''}</small>
    </article>`;
  }

  if (isLive(match) && scoreText) {
    return `<article class="match-card live">
      <div class="match-top"><span>${match.stage}</span><time>${formatDate(match.date)}</time></div>
      <div class="score-line"><strong>${match.home}</strong><b>${scoreText}</b><strong>${match.away}</strong></div>
      <p class="prediction"><b>Ao vivo:</b> ${match.status}</p>
      <small>Placar atualizado automaticamente pela internet.</small>
    </article>`;
  }

  const p = predict(match);
  return `<article class="match-card upcoming">
    <div class="match-top"><span>${match.stage}</span><time>${formatDate(match.date)}</time></div>
    <div class="score-line"><strong>${match.home}</strong><b>${p.homeGoals} × ${p.awayGoals}</b><strong>${match.away}</strong></div>
    <p class="prediction"><b>Previsão:</b> ${p.winner}</p>
    <div class="probabilities">
      <span>${match.home}: ${p.homeChance}%</span>
      <span>Empate: ${p.drawChance}%</span>
      <span>${match.away}: ${p.awayChance}%</span>
    </div>
    <div class="bars"><i style="width:${p.homeChance}%"></i><i style="width:${p.drawChance}%"></i><i style="width:${p.awayChance}%"></i></div>
    <small>Base: força histórica, ranking, valor técnico e desempenho nos jogos já finalizados.</small>
  </article>`;
}

function renderMatches() {
  const ordered = [...liveData.matches].sort((a, b) => new Date(a.date) - new Date(b.date));
  const filtered = ordered.filter(m => currentFilter === 'all' || (currentFilter === 'finished' ? isFinished(m) : !isFinished(m)));
  matchesEl.innerHTML = filtered.map(matchCard).join('') || '<p class="empty-state">Nenhum jogo encontrado.</p>';

  const next = ordered.find(m => !isFinished(m));
  if (next) {
    const p = predict(next);
    nextMatchTitle.textContent = `${next.home} x ${next.away}`;
    nextMatchPrediction.textContent = isLive(next) && Number.isInteger(next.homeScore)
      ? `Ao vivo: ${next.homeScore} x ${next.awayScore}`
      : `Palpite: ${p.homeGoals} x ${p.awayGoals} — ${p.winner}`;
  } else {
    nextMatchTitle.textContent = 'Todos os jogos foram finalizados';
    nextMatchPrediction.textContent = 'Confira o ranking final.';
  }
}

function renderAll() {
  renderSummary();
  renderRankings();
  renderMatches();
}

function formatDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
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
    setSyncStatus(`Usando dados locais. Motivo: ${error.message}`, 'warning');
  }
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
  const completed = competition.status?.type?.completed || /final/i.test(statusName);
  return {
    id: event.id,
    date: event.date,
    stage: event.season?.slug || event.shortName || 'Copa do Mundo',
    home: normalizeTeamName(home.team?.displayName || home.team?.shortDisplayName),
    away: normalizeTeamName(away.team?.displayName || away.team?.shortDisplayName),
    homeScore: home.score !== undefined && home.score !== '' ? Number(home.score) : undefined,
    awayScore: away.score !== undefined && away.score !== '' ? Number(away.score) : undefined,
    status: completed ? 'Finalizado' : statusName,
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
    stage: m.stage || m.group || 'Copa do Mundo',
    home: normalizeTeamName(m.homeTeam?.shortName || m.homeTeam?.name),
    away: normalizeTeamName(m.awayTeam?.shortName || m.awayTeam?.name),
    homeScore: Number.isInteger(m.score?.fullTime?.home) ? m.score.fullTime.home : undefined,
    awayScore: Number.isInteger(m.score?.fullTime?.away) ? m.score.fullTime.away : undefined,
    status: m.status === 'FINISHED' ? 'Finalizado' : m.status,
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
    if (map.has(key)) Object.assign(map.get(key), apiMatch);
    else merged.matches.push(apiMatch);
  });
  return merged;
}

function matchKey(match) {
  return `${String(match.date).slice(0, 10)}|${match.home}|${match.away}`.toLowerCase();
}

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.dataset.filter;
    renderMatches();
  });
});

refreshScoresBtn?.addEventListener('click', loadInternetScores);

renderAll();
loadInternetScores();
refreshTimer = setInterval(loadInternetScores, Math.max(30, API_CONFIG.refreshSeconds) * 1000);
