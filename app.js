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

function openMatchDetails(id) {
  const match = liveData.matches.find(m => String(matchIdentifier(m)) === String(id));
  if (!match || !matchDetailsEl || !matchModalEl) return;
  const p = predict(match);
  const liveScore = `${Number.isInteger(match.homeScore) ? match.homeScore : 0} × ${Number.isInteger(match.awayScore) ? match.awayScore : 0}`;
  const score = isFinished(match) || shouldShowLiveHighlight(match) ? liveScore : `${p.homeGoals} × ${p.awayGoals}`;
  matchDetailsEl.innerHTML = `
    <span class="modal-kicker">${translateStage(match.stage)} • ${formatDateTime(match.date)}</span>
    <h2>${match.home} x ${match.away}</h2>
    <div class="modal-score">${score}</div>
    <p><b>Status:</b> ${matchStatusText(match)}</p>
    <p><b>Previsão:</b> ${p.winner} • ${p.homeGoals} x ${p.awayGoals}</p>
    <div class="detail-grid">
      <div><strong>${match.home}</strong><span>${getTeamStatsLine(match.home)}</span><small>Chance: ${p.homeChance}%</small></div>
      <div><strong>Empate</strong><span>Equilíbrio no tempo normal</span><small>Chance: ${p.drawChance}%</small></div>
      <div><strong>${match.away}</strong><span>${getTeamStatsLine(match.away)}</span><small>Chance: ${p.awayChance}%</small></div>
    </div>
    <p><b>Escalação provável:</b> disponível quando a API fornecer dados oficiais de pré-jogo.</p>
    <button class="share-btn" type="button" data-share-id="${matchIdentifier(match)}">Compartilhar previsão</button>
  `;
  matchModalEl.setAttribute('aria-hidden', 'false');
  matchModalEl.classList.add('open');
}

function closeMatchDetails() {
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
      <p class="prediction"><b>Ao vivo:</b> ${status}</p>
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
      if (nextMatchLabel) nextMatchLabel.textContent = 'AO VIVO';
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
    setSyncStatus(`Usando dados locais. Motivo: ${error.message}`, 'warning');
  }
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
  const completed = competition.status?.type?.completed || /final/i.test(statusName);
  return {
    id: event.id,
    date: event.date,
    stage: translateStage(event.season?.slug || event.shortName || 'Copa do Mundo'),
    home: normalizeTeamName(home.team?.displayName || home.team?.shortDisplayName),
    away: normalizeTeamName(away.team?.displayName || away.team?.shortDisplayName),
    homeScore: home.score !== undefined && home.score !== '' ? Number(home.score) : undefined,
    awayScore: away.score !== undefined && away.score !== '' ? Number(away.score) : undefined,
    status: completed ? 'Finalizado' : translateStatus(statusName),
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
