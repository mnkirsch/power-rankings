// ═══════════════════════════════════════════════
//  TEAMS PAGE
// ═══════════════════════════════════════════════

let playersCache  = null;
let matchupsCache = null;

async function renderTeamsPage() {
  if (!leagueData) return;
  showTeamsList();
document.getElementById('teams-week-chip').textContent = weekLabel(currentWeek);
  
  const list = document.getElementById('teams-list');
  list.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

  try {
    [matchupsCache, playersCache] = await Promise.all([
      matchupsCache || getMatchups(currentLeague.id, currentWeek),
      playersCache  || getAllPlayers(),
    ]);
  } catch(e) {
    list.innerHTML = `<div class="empty-state">Failed to load player data.<br>${e.message}</div>`;
    return;
  }

  const { sr, um } = leagueData;
  const matchupMap = {};
  (matchupsCache || []).forEach(m => matchupMap[m.roster_id] = m);

  list.innerHTML = '';
  sr.forEach((r, i) => {
    const u = um[r.owner_id];
    const matchup = matchupMap[r.roster_id];
    const weekPts = matchup?.points != null ? matchup.points.toFixed(1) : '—';
    const rec = `${r.settings.wins}-${r.settings.losses}`;

    const row = document.createElement('div');
    row.className = 'team-row';
    row.innerHTML = `
      <div class="team-row-rank">${i + 1}</div>
      ${avatarDiv(u?.avatar, 'sm-av')}
      <div class="team-row-info">
        <div class="team-row-name">${teamName(r, um)}</div>
        <div class="team-row-meta">${ownerName(r, um)} · ${rec} · ${seasonPts(r)} pts</div>
      </div>
      <div class="team-row-right">
        <div class="team-row-pts">${weekPts}</div>
        <div class="team-row-wk">Wk ${currentWeek}</div>
      </div>
      <div class="team-row-arrow">›</div>`;
    row.onclick = () => showTeamDetail(r, matchup);
    list.appendChild(row);
  });
}

function showTeamsList() {
  show('teams-list-view');
  hide('team-detail-view');
}

async function showTeamDetail(roster, matchup) {
  hide('teams-list-view');
  show('team-detail-view');

  const { um } = leagueData;
  const u = um[roster.owner_id];
  const rec = `${roster.settings.wins}-${roster.settings.losses}`;
  const weekPts = matchup?.points != null ? matchup.points.toFixed(1) : '—';

  // Header
  document.getElementById('team-detail-header').innerHTML = `
    ${avatarDiv(u?.avatar, 'team-detail-av', 54)}
    <div style="flex:1;min-width:0">
      <div class="team-detail-name">${teamName(roster, um)}</div>
      <div class="team-detail-owner">${ownerName(roster, um)}</div>
      <div class="team-stats-grid">
        <div class="team-stat"><div class="team-stat-val">${rec}</div><div class="team-stat-lbl">Record</div></div>
        <div class="team-stat"><div class="team-stat-val">${weekPts}</div><div class="team-stat-lbl">Wk ${currentWeek}</div></div>
        <div class="team-stat"><div class="team-stat-val">${seasonPts(roster)}</div><div class="team-stat-lbl">Season</div></div>
        <div class="team-stat"><div class="team-stat-val">${ptsAgainst(roster)}</div><div class="team-stat-lbl">Against</div></div>
      </div>
    </div>`;

  // Player data
  const starters     = matchup?.starters    || roster.starters || [];
  const allPlayers   = matchup?.players     || roster.players  || [];
  const bench        = allPlayers.filter(pid => !starters.includes(pid));
  const playerPts    = matchup?.players_points || {};
  const rosterPos    = currentLeague.info?.roster_positions || [];

  // Lineup efficiency
  const actualPts  = starters.reduce((s, pid) => s + (playerPts[pid] ?? 0), 0);
  const optimalPts = computeOptimalScore(starters, bench, playerPts, rosterPos, playersCache);
  const efficiency = optimalPts > 0 ? Math.min(100, (actualPts / optimalPts) * 100) : null;

  const effWrap = document.getElementById('team-eff-wrap');
  if (efficiency !== null && matchup) {
    const color = efficiency >= 90 ? 'var(--green)' : efficiency >= 75 ? 'var(--gold)' : 'var(--red)';
    const left  = (optimalPts - actualPts).toFixed(1);
    effWrap.innerHTML = `
      <div class="eff-header">
        <span class="eff-title">Lineup Efficiency — Wk ${currentWeek}</span>
        <span class="eff-pct" style="color:${color}">${efficiency.toFixed(1)}%</span>
      </div>
      <div class="eff-bg"><div class="eff-fill" style="width:${efficiency}%;background:${color}"></div></div>
      <div class="eff-note">${actualPts.toFixed(1)} scored · ${optimalPts.toFixed(1)} optimal · ${left} pts left on bench</div>`;
    show('team-eff-wrap');
  } else {
    hide('team-eff-wrap');
  }

  // Starters
  const starterRows = starters.map((pid, idx) => ({
    pid,
    player:  playersCache?.[pid],
    pts:     playerPts[pid] ?? null,
    slotPos: rosterPos[idx] || 'BN',
    isBench: false,
  }));
  renderPlayerSection('team-starters-section', '🟢 Starters', starterRows, false);

  // Bench
  const benchRows = bench.map(pid => {
    const pts = playerPts[pid] ?? null;
    const benchPts = pts ?? 0;
    const minStarterPts = Math.min(...starters.map(s => playerPts[s] ?? 0));
    return {
      pid,
      player: playersCache?.[pid],
      pts,
      slotPos: 'BN',
      isBench: true,
      shouldStart: benchPts > minStarterPts && starters.length > 0,
    };
  }).sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
  renderPlayerSection('team-bench-section', '🪑 Bench', benchRows, true);
}

function renderPlayerSection(elId, title, rows, isBench) {
  const el = document.getElementById(elId);
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="players-section">
      <div class="players-section-title">${title}</div>
      ${rows.map(({ pid, player, pts, slotPos, shouldStart }) => {
        const name    = player ? `${player.first_name || ''} ${player.last_name || pid}`.trim() : `Player ${pid}`;
        const nflTeam = player?.team || '';
        const posKey  = slotPos.replace(/[^A-Z_]/g, '');
        const ptsStr  = pts !== null ? pts.toFixed(1) : '—';
        const ptsCls  = pts === null ? '' : pts === 0 ? ' zero' : isBench ? ' bench-pts' : '';
        const flag    = shouldStart ? '<span class="should-start">⚠ should\'ve started</span>' : '';
        return `
          <div class="player-row${isBench ? ' bench' : ''}">
            <span class="player-pos pos-${posKey}">${slotPos}</span>
            <span class="player-name">${name}<span class="player-nfl-team">${nflTeam}</span>${flag}</span>
            <span class="player-pts${ptsCls}">${ptsStr}</span>
          </div>`;
      }).join('')}
    </div>`;
}

function computeOptimalScore(starters, bench, playerPts, rosterPositions, players) {
  const all = [...starters, ...bench]
    .map(pid => ({ pid, pts: playerPts[pid] ?? 0, pos: players?.[pid]?.position || 'WR' }))
    .sort((a, b) => b.pts - a.pts);

  let total = 0;
  const used = new Set();
  const locked = ['QB', 'K', 'DEF', 'DL', 'LB', 'DB'];

  // Locked positions first
  rosterPositions.forEach(slot => {
    if (slot === 'BN' || slot === 'IR') return;
    if (locked.includes(slot)) {
      const best = all.find(p => !used.has(p.pid) && p.pos === slot);
      if (best) { total += best.pts; used.add(best.pid); }
    }
  });
  // Flex positions
  rosterPositions.forEach(slot => {
    if (slot === 'BN' || slot === 'IR' || locked.includes(slot)) return;
    const eligible =
      slot === 'FLEX'        ? ['RB','WR','TE'] :
      slot === 'SUPER_FLEX'  ? ['QB','RB','WR','TE'] :
      slot === 'REC_FLEX'    ? ['WR','TE'] :
      slot === 'WRTEF'       ? ['WR','TE','RB'] : [slot];
    const best = all.find(p => !used.has(p.pid) && eligible.includes(p.pos));
    if (best) { total += best.pts; used.add(best.pid); }
  });
  return total;
}
