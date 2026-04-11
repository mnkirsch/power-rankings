// ═══════════════════════════════════════════════
//  API — Sleeper + Supabase helpers
// ═══════════════════════════════════════════════

let _sb = null;

function getSB() {
  if (!_sb) _sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  return _sb;
}

// ── SLEEPER ──────────────────────────────────────────────────────────────────

async function slGet(path) {
  const r = await fetch(SLEEPER_BASE + path);
  if (!r.ok) throw new Error(`Sleeper ${r.status}: ${path}`);
  return r.json();
}

async function getUser(username) {
  const u = await slGet(`/user/${username}`);
  if (!u?.user_id) throw new Error('not_found');
  return u;
}

async function getNFLState() {
  try { return await slGet('/state/nfl'); } catch { return { week: 1, season: '2025' }; }
}

async function getLeague(leagueId) {
  return slGet(`/league/${leagueId}`);
}

async function getLeagueUsers(leagueId) {
  return slGet(`/league/${leagueId}/users`);
}

async function getLeagueRosters(leagueId) {
  return slGet(`/league/${leagueId}/rosters`);
}

async function getMatchups(leagueId, week) {
  return slGet(`/league/${leagueId}/matchups/${week}`);
}

async function getAllPlayers() {
  const r = await fetch(`${SLEEPER_BASE}/players/nfl`);
  if (!r.ok) throw new Error('Failed to fetch players');
  return r.json();
}

// ── SUPABASE — VOTES ─────────────────────────────────────────────────────────

async function saveVote(leagueId, week, user, rankings) {
  const { error } = await getSB().from('votes').upsert({
    league_id:           leagueId,
    week,
    voter_user_id:       user.user_id,
    voter_username:      user.username,
    voter_display_name:  user.display_name,
    rankings,
    submitted_at:        new Date().toISOString(),
  }, { onConflict: 'league_id,week,voter_user_id' });
  if (error) throw error;
}

async function getVotesForWeek(leagueId, week) {
  const { data, error } = await getSB().from('votes')
    .select('*').eq('league_id', leagueId).eq('week', week);
  if (error) throw error;
  return data || [];
}

async function getMyVote(leagueId, week, userId) {
  const { data } = await getSB().from('votes')
    .select('*')
    .eq('league_id', leagueId).eq('week', week).eq('voter_user_id', userId)
    .single();
  return data;
}

// ── SUPABASE — RANKING HISTORY ───────────────────────────────────────────────

async function saveRankingHistory(rows) {
  const { error } = await getSB().from('ranking_history')
    .upsert(rows, { onConflict: 'league_id,week,roster_id' });
  if (error) throw error;
}

async function getRankingHistory(leagueId) {
  const { data, error } = await getSB().from('ranking_history')
    .select('*').eq('league_id', leagueId).order('week', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getWeekRankings(leagueId, week) {
  const { data } = await getSB().from('ranking_history')
    .select('roster_id, rank').eq('league_id', leagueId).eq('week', week);
  const map = {};
  (data || []).forEach(r => map[String(r.roster_id)] = r.rank);
  return map;
}

// ── SUPABASE — SUMMARIES ─────────────────────────────────────────────────────

async function getSummary(leagueId, week) {
  const { data } = await getSB().from('weekly_summaries')
    .select('*').eq('league_id', leagueId).eq('week', week).single();
  return data;
}

async function saveSummary(leagueId, week, text, generatedBy) {
  const { error } = await getSB().from('weekly_summaries').upsert({
    league_id:    leagueId,
    week,
    summary_text: text,
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
  }, { onConflict: 'league_id,week' });
  if (error) throw error;
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function buildUsersMap(users) {
  const m = {};
  (users || []).forEach(u => m[u.user_id] = u);
  return m;
}

function sortedRosters(rosters) {
  return [...rosters].sort((a, b) =>
    (b.settings.wins - a.settings.wins) || (b.settings.fpts - a.settings.fpts)
  );
}

function teamName(roster, usersMap) {
  const u = usersMap[roster.owner_id];
  return u?.metadata?.team_name || u?.display_name || `Team ${roster.roster_id}`;
}

function ownerName(roster, usersMap) {
  return usersMap[roster.owner_id]?.display_name || '—';
}

function avatarDiv(avatarId, cls, size = 36) {
  const s = `width:${size}px;height:${size}px`;
  if (!avatarId) return `<div class="${cls}" style="${s}">🏈</div>`;
  return `<div class="${cls}" style="${s}"><img src="${SLEEPER_CDN}${avatarId}" onerror="this.parentElement.innerHTML='🏈'" style="width:100%;height:100%;object-fit:cover"/></div>`;
}

function seasonPts(roster) {
  return ((roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100).toFixed(1);
}

function ptsAgainst(roster) {
  return ((roster.settings.fpts_against || 0) + (roster.settings.fpts_against_decimal || 0) / 100).toFixed(1);
}
