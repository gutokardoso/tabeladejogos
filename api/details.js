const UA = 'Mozilla/5.0 (compatible; CopaPessoal/1.0; +https://vercel.app) AppleWebKit/537.36 Chrome/120 Safari/537.36';

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const q = req.query || {};
    const match = {
      id: String(q.id || ''),
      home: normalizeTeamName(String(q.home || '')),
      away: normalizeTeamName(String(q.away || '')),
      date: String(q.date || '').slice(0, 10)
    };

    const sources = [
      ['ESPN Summary', () => fetchEspnSummary(match)],
      ['ESPN Play-by-play', () => fetchEspnPlayByPlay(match)],
      ['Sofascore público', () => fetchSofascore(match)],
      ['TheSportsDB público', () => fetchTheSportsDb(match)],
      ['Google Search público', () => fetchGoogleSearch(match)]
    ];

    const payloads = [];
    for (const [name, loader] of sources) {
      try {
        const data = await withTimeout(loader(), 6500);
        if (data && hasUseful(data)) payloads.push({ ...data, sources: [...(data.sources || []), name] });
      } catch (err) {
        // Fonte pública falhou/bloqueou. Continua para a próxima.
      }
    }

    const merged = payloads.reduce((acc, item) => merge(acc, item), { sources: [] });
    return res.status(200).json({
      ...merged,
      sources: [...new Set(merged.sources || [])],
      generatedAt: new Date().toISOString(),
      mode: 'free-public-aggregator'
    });
  } catch (err) {
    return res.status(200).json({ sources: [], error: 'Não foi possível consultar as fontes públicas agora.' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/plain,*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function fetchEspnSummary(match) {
  if (!match.id) return null;
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${encodeURIComponent(match.id)}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${encodeURIComponent(match.id)}`
  ];
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const parsed = parseEspnPackage(data, match);
      if (hasUseful(parsed)) return parsed;
    } catch (_) {}
  }
  return null;
}

async function fetchEspnPlayByPlay(match) {
  if (!match.id) return null;
  const urls = [
    `https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/playbyplay?event=${encodeURIComponent(match.id)}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/playbyplay?event=${encodeURIComponent(match.id)}`
  ];
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const parsed = parseEspnPackage(data, match);
      if (hasUseful(parsed)) return parsed;
    } catch (_) {}
  }
  return null;
}

function parseEspnPackage(data, match) {
  const competitions = [
    data.header?.competitions?.[0],
    data.gamepackageJSON?.header?.competitions?.[0],
    data.boxscore?.gamepackageJSON?.header?.competitions?.[0]
  ].filter(Boolean);
  const competition = competitions[0] || {};
  const venue = competition.venue?.fullName || competition.venue?.displayName || data.gameInfo?.venue?.fullName || data.gameInfo?.venue?.displayName || '';
  const referee = data.gameInfo?.officials?.[0]?.displayName || competition.officials?.[0]?.displayName || '';
  const attendance = data.gameInfo?.attendance ? Number(data.gameInfo.attendance).toLocaleString('pt-BR') : '';
  const plays = uniqueObjects([
    ...(data.scoringPlays || []), ...(data.plays || []), ...(data.commentary || []),
    ...(data.gamepackageJSON?.plays || []), ...(data.gamepackageJSON?.scoringPlays || [])
  ]);

  const goals = [];
  const cards = [];
  const fouls = [];
  const substitutions = [];

  for (const play of plays) {
    const text = getPlayText(play);
    const type = `${play.type?.text || ''} ${play.type?.abbreviation || ''} ${play.type || ''}`;
    const clock = play.clock?.displayValue || play.time?.displayValue || play.displayTime || play.clock || '';
    const team = normalizeTeamName(play.team?.displayName || play.team?.name || inferTeam(text, match));
    const player = play.athletes?.[0]?.displayName || play.participants?.[0]?.athlete?.displayName || extractPlayer(text);

    if (/goal|gol/i.test(type + ' ' + text) && !/own goal against/i.test(text)) {
      goals.push({ time: normalizeMinute(clock || extractMinute(text)), player: player || extractPlayer(text), team, assist: extractAssist(text) });
    } else if (/yellow|red|card|cart[aã]o/i.test(type + ' ' + text)) {
      cards.push({ time: normalizeMinute(clock || extractMinute(text)), player: player || extractPlayer(text), team, card: /red|vermelho/i.test(type + ' ' + text) ? 'Cartão vermelho' : 'Cartão amarelo' });
    } else if (/foul|falta/i.test(type + ' ' + text)) {
      fouls.push({ time: normalizeMinute(clock || extractMinute(text)), player: player || extractPlayer(text), drawnBy: extractDrawnBy(text), team });
    } else if (/substitution|substitui|substitution/i.test(type + ' ' + text)) {
      substitutions.push({ time: normalizeMinute(clock || extractMinute(text)), in: extractSubIn(text), out: extractSubOut(text), team });
    }
  }

  return { venue, referee, attendance, goals: uniqueEvents(goals), cards: uniqueEvents(cards), fouls: uniqueEvents(fouls).slice(0, 40), substitutions: uniqueEvents(substitutions).slice(0, 30), stats: parseEspnStats(data, match) };
}

function parseEspnStats(data, match) {
  const result = {};
  const teams = data.boxscore?.teams || data.boxscore?.statistics || [];
  if (Array.isArray(teams) && teams.length >= 2) {
    const rows = teams.map(t => ({ team: normalizeTeamName(t.team?.displayName || t.team?.name || ''), stats: t.statistics || t.stats || [] }));
    const findStat = (row, names) => {
      for (const st of row.stats || []) {
        const key = String(st.name || st.abbreviation || st.label || st.displayName || '').toLowerCase();
        if (names.some(n => key.includes(n))) return st.displayValue || st.value || '';
      }
      return '';
    };
    const labels = [
      ['possession', ['possession', 'posse']], ['shots', ['totalshots', 'shots', 'chutes']],
      ['shotsOnGoal', ['shotson', 'shotsontarget', 'finalizações no gol']], ['corners', ['corner', 'escanteio']],
      ['fouls', ['foul', 'falta']], ['yellowCards', ['yellow', 'amarelo']], ['redCards', ['red', 'vermelho']]
    ];
    for (const [out, names] of labels) {
      const a = findStat(rows[0], names); const b = findStat(rows[1], names);
      if (a || b) result[out] = `${rows[0].team || match.home} ${a || '-'} x ${b || '-'} ${rows[1].team || match.away}`;
    }
  }
  return result;
}

async function fetchSofascore(match) {
  const query = `${match.home} ${match.away}`;
  const search = await fetchJson(`https://www.sofascore.com/api/v1/search/all?q=${encodeURIComponent(query)}`);
  const events = search.events || (search.results || []).flatMap(r => r.entity?.events || []);
  const ev = chooseEvent(events, match);
  if (!ev?.id) return null;
  const [incidents, lineups, stats] = await Promise.allSettled([
    fetchJson(`https://www.sofascore.com/api/v1/event/${ev.id}/incidents`),
    fetchJson(`https://www.sofascore.com/api/v1/event/${ev.id}/lineups`),
    fetchJson(`https://www.sofascore.com/api/v1/event/${ev.id}/statistics`)
  ]);
  const data = incidents.status === 'fulfilled' ? incidents.value : {};
  const incidentList = data.incidents || [];
  const goals = incidentList.filter(i => /goal/i.test(i.incidentType || i.incidentClass || '')).map(i => ({
    time: minuteFromSofa(i), player: i.player?.name || i.playerName || '', team: normalizeTeamName(i.isHome ? match.home : match.away), assist: i.assist1?.name || i.assist2?.name || ''
  }));
  const cards = incidentList.filter(i => /card/i.test(i.incidentType || '') || /yellow|red/i.test(i.incidentClass || i.cardType || '')).map(i => ({
    time: minuteFromSofa(i), player: i.player?.name || i.playerName || '', team: normalizeTeamName(i.isHome ? match.home : match.away), card: /red/i.test(i.incidentClass || i.cardType || '') ? 'Cartão vermelho' : 'Cartão amarelo'
  }));
  const substitutions = incidentList.filter(i => /substitution/i.test(i.incidentType || '')).map(i => ({
    time: minuteFromSofa(i), in: i.playerIn?.name || i.player?.name || '', out: i.playerOut?.name || '', team: normalizeTeamName(i.isHome ? match.home : match.away)
  }));
  const parsedStats = stats.status === 'fulfilled' ? parseSofascoreStats(stats.value, match) : {};
  return { goals, cards, substitutions, stats: parsedStats };
}

function chooseEvent(events, match) {
  const dateKey = match.date;
  const normalizedHome = compact(match.home); const normalizedAway = compact(match.away);
  return (events || []).find(ev => {
    const d = ev.startTimestamp ? new Date(ev.startTimestamp * 1000).toISOString().slice(0, 10) : String(ev.startTime || '').slice(0, 10);
    const h = compact(ev.homeTeam?.name || ev.homeTeam?.shortName || '');
    const a = compact(ev.awayTeam?.name || ev.awayTeam?.shortName || '');
    return d === dateKey && ((h.includes(normalizedHome) || normalizedHome.includes(h)) && (a.includes(normalizedAway) || normalizedAway.includes(a)) || (h.includes(normalizedAway) && a.includes(normalizedHome)));
  }) || (events || [])[0];
}

function minuteFromSofa(i) { return i.time ? `${i.time}${i.addedTime ? '+' + i.addedTime : ''}’` : ''; }

function parseSofascoreStats(data, match) {
  const stats = {};
  const groups = data.statistics || [];
  for (const group of groups) {
    for (const item of group.groups || group.statisticsItems || []) {
      for (const st of item.statisticsItems || item.items || []) {
        const name = String(st.name || st.key || '').toLowerCase();
        const value = `${match.home} ${st.homeValue ?? st.home ?? '-'} x ${st.awayValue ?? st.away ?? '-'} ${match.away}`;
        if (/possession/.test(name)) stats.possession = value;
        if (/shots on target/.test(name)) stats.shotsOnGoal = value;
        if (/total shots/.test(name)) stats.shots = value;
        if (/corner/.test(name)) stats.corners = value;
        if (/foul/.test(name)) stats.fouls = value;
      }
    }
  }
  return stats;
}

async function fetchTheSportsDb(match) {
  const variants = [`${match.home}_vs_${match.away}`, `${match.away}_vs_${match.home}`, `${match.home} vs ${match.away}`];
  for (const q of variants) {
    try {
      const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${encodeURIComponent(q)}`);
      const event = chooseSportsDbEvent(data.event || [], match);
      if (!event) continue;
      return {
        venue: event.strVenue || event.strCity || '',
        goals: [...parseMultiline(event.strHomeGoalDetails, match.home), ...parseMultiline(event.strAwayGoalDetails, match.away)],
        cards: [...parseMultiline(event.strHomeYellowCards, match.home, 'Cartão amarelo'), ...parseMultiline(event.strAwayYellowCards, match.away, 'Cartão amarelo'), ...parseMultiline(event.strHomeRedCards, match.home, 'Cartão vermelho'), ...parseMultiline(event.strAwayRedCards, match.away, 'Cartão vermelho')]
      };
    } catch (_) {}
  }
  return null;
}

function chooseSportsDbEvent(events, match) {
  return events.find(ev => String(ev.dateEvent || '').slice(0, 10) === match.date) || events[0];
}

async function fetchGoogleSearch(match) {
  const query = `${match.home} x ${match.away} ${match.date} gols cartões escanteios faltas`;
  const html = await fetchText(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=br`);
  const text = toText(html);
  return parseLooseText(text, match, 'Google Search');
}

function parseLooseText(text, match) {
  return {
    venue: ((text.match(/(?:Estádio|Stadium|Venue)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\.\|]{3,70})/i) || [])[1] || '').trim(),
    goals: extractGoals(text, match),
    cards: extractCards(text, match),
    fouls: []
  };
}

function extractGoals(text, match) {
  const goals = [];
  const patterns = [
    /(\d{1,3}(?:\+\d{1,2})?)[’'º]?\s*(?:gol|goal)?\s*(?:de|do|da)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'\-. ]{2,40})/gi,
    /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'\-. ]{2,40})\s*(\d{1,3}(?:\+\d{1,2})?)[’'º]/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) && goals.length < 12) {
      const time = /^\d/.test(m[1]) ? m[1] : m[2];
      const player = /^\d/.test(m[1]) ? m[2] : m[1];
      if (isBadName(player)) continue;
      goals.push({ time: `${time}’`, player: cleanName(player), team: inferTeam(player, match) });
    }
  }
  return uniqueEvents(goals);
}

function extractCards(text, match) {
  const cards = [];
  const re = /(cartão amarelo|cartão vermelho|yellow card|red card)[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]{0,20}([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'\-. ]{2,40})/gi;
  let m;
  while ((m = re.exec(text)) && cards.length < 20) {
    cards.push({ time: '', player: cleanName(m[2]), team: inferTeam(m[2], match), card: /red|vermelho/i.test(m[1]) ? 'Cartão vermelho' : 'Cartão amarelo' });
  }
  return uniqueEvents(cards);
}

function parseMultiline(value, team, card) {
  if (!value) return [];
  return String(value).split(/[;\n]/).map(s => s.trim()).filter(Boolean).map(entry => {
    const m = entry.match(/(\d{1,3}(?:\+\d{1,2})?)['’º:]?/);
    const player = entry.replace(/(\d{1,3}(?:\+\d{1,2})?)['’º:]?/, '').replace(/\(.*?\)/g, '').trim();
    return card ? { time: m ? `${m[1]}’` : '', player, team, card } : { time: m ? `${m[1]}’` : '', player, team };
  });
}

function getPlayText(play) { return String(play.text || play.headline || play.description || play.displayText || ''); }
function normalizeMinute(value) { const m = String(value || '').match(/(\d{1,3})(?:[:']\d{2})?(?:\+(\d{1,2}))?/); return m ? `${m[1]}${m[2] ? '+' + m[2] : ''}’` : ''; }
function extractMinute(text) { const m = String(text || '').match(/(\d{1,3})(?:\+\d{1,2})?[’'º]/); return m ? m[0] : ''; }
function extractAssist(text) { const m = String(text || '').match(/assist(?:ed by|ência de|ido por)?\s*([^\.\,\)]+)/i); return m ? cleanName(m[1]) : ''; }
function extractDrawnBy(text) { const m = String(text || '').match(/(?:drawn by|sofrida por)\s*([^\.\,]+)/i); return m ? cleanName(m[1]) : ''; }
function extractPlayer(text) { const m = String(text || '').match(/(?:Goal!|Gol!|Yellow Card|Red Card|Cartão amarelo|Cartão vermelho)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'\-. ]{2,40})/); return m && !isBadName(m[1]) ? cleanName(m[1]) : ''; }
function extractSubIn(text) { const m = String(text || '').match(/(?:entra|enters|Substitution.*?,)\s*([^,\.]+?)\s*(?:replaces|substitui|for)/i); return m ? cleanName(m[1]) : ''; }
function extractSubOut(text) { const m = String(text || '').match(/(?:replaces|substitui|for)\s*([^,\.]+)/i); return m ? cleanName(m[1]) : ''; }
function inferTeam(text, match) { const hay = compact(text); if (hay.includes(compact(match.home))) return match.home; if (hay.includes(compact(match.away))) return match.away; return ''; }
function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').replace(/^[\-–—:,\s]+|[\-–—:,\s]+$/g, '').trim(); }
function isBadName(s) { return /fifa|world cup|copa|google|youtube|news|notícia|placar|tempo|ao vivo|imagem|estatística|brasil x|alemanh/i.test(String(s || '')); }
function compact(s) { return normalizeTeamName(String(s || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function toText(html) { return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' '); }
function uniqueObjects(items) { const seen = new Set(); return items.filter(x => { const key = JSON.stringify(x).slice(0, 300); if (seen.has(key)) return false; seen.add(key); return true; }); }
function uniqueEvents(items = []) { const seen = new Set(); return (items || []).filter(item => { if (!item) return false; const key = `${item.time || ''}|${item.player || item.in || ''}|${item.team || ''}|${item.card || ''}`.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }); }
function hasUseful(d = {}) { return Boolean(d.venue || d.referee || d.attendance || d.goals?.length || d.cards?.length || d.fouls?.length || d.substitutions?.length || (d.stats && Object.keys(d.stats).length)); }
function merge(a = {}, b = {}) { return { venue: b.venue || a.venue, referee: b.referee || a.referee, attendance: b.attendance || a.attendance, clock: b.clock || a.clock, goals: uniqueEvents([...(a.goals || []), ...(b.goals || [])]), cards: uniqueEvents([...(a.cards || []), ...(b.cards || [])]), fouls: uniqueEvents([...(a.fouls || []), ...(b.fouls || [])]), substitutions: uniqueEvents([...(a.substitutions || []), ...(b.substitutions || [])]), stats: { ...(a.stats || {}), ...(b.stats || {}) }, sources: [...new Set([...(a.sources || []), ...(b.sources || [])])] }; }

function normalizeTeamName(name = '') {
  const map = { Brazil: 'Brasil', Japan: 'Japão', Germany: 'Alemanha', Paraguay: 'Paraguai', Netherlands: 'Holanda', Morocco: 'Marrocos', France: 'França', Sweden: 'Suécia', England: 'Inglaterra', Spain: 'Espanha', Portugal: 'Portugal', Croatia: 'Croácia', Canada: 'Canadá', Mexico: 'México', Ecuador: 'Equador', Norway: 'Noruega', 'Ivory Coast': 'Costa do Marfim', 'Cape Verde': 'Cabo Verde', Switzerland: 'Suíça', Algeria: 'Argélia', Austria: 'Áustria', Australia: 'Austrália', Egypt: 'Egito', Ghana: 'Gana', Senegal: 'Senegal', Belgium: 'Bélgica', 'United States': 'Estados Unidos', USA: 'Estados Unidos' };
  return map[name] || name;
}
