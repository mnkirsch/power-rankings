// ═══════════════════════════════════════════════
//  LEAGUE HISTORY PAGE
//  All aggregation keyed on owner_user_id.
//  Display names resolved from current league data.
// ═══════════════════════════════════════════════

let historyTab = 'efficiency';

// Build a map of user_id → current display name from leagueData
function currentNameMap() {
  const map = {};
  if (!leagueData?.users) return map;
  leagueData.users.forEach(u => {
    map[u.user_id] = u.display_name || u.username || u.user_id;
  });
  return map;
}

function displayName(userId, nameMap) {
  if (!userId) return 'League-Run Team';
  if (nameMap[userId]) return nameMap[userId];
  // Shorten raw IDs to something readable
  if (/^\d{10,}$/.test(userId)) return `Unknown (…${userId.slice(-4)})`;
  return userId;
}

async function renderLeagueHistoryPage() {
  if (!leagueData) return;

  const wrap = document.getElementById('lh-content');
  wrap.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

  const { data: seasons } = await getSB().from('historical_seasons')
    .select('*').eq('league_id', currentLeague.id).order('season');

  if (!seasons?.length) {
    wrap.innerHTML = `<div class="empty-state">No historical data yet.<br>Ask the commissioner to run the import.</div>`;
    return;
  }

  document.getElementById('lh-tabs').style.display = 'flex';
  switchHistoryTab(historyTab);
}

function switchHistoryTab(tab) {
  historyTab = tab;
  document.querySelectorAll('.lh-tab').forEach(t => t.classList.remove('active'));
  const btn = document.querySelector(`.lh-tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  const wrap = document.getElementById('lh-content');
  wrap.innerHTML = '<div class="spinner" style="margin:30px auto"></div>';

  if      (tab === 'efficiency') renderEfficiencyTab(wrap);
  else if (tab === 'seasons')    renderSeasonsTab(wrap);
  else if (tab === 'records')    renderRecordsTab(wrap);
  else if (tab === 'h2h')        renderH2HTab(wrap);
}

// ── EFFICIENCY TAB ───────────────────────────────────────────────────────────

async function renderEfficiencyTab(wrap) {
  const { data: rows } = await getSB().from('historical_efficiency')
    .select('*').eq('league_id', currentLeague.id)
    .order('points_left', { ascending: false });

  if (!rows?.length) {
    wrap.innerHTML = '<div class="empty-state">No efficiency data yet.</div>'; return;
  }

  const nm = currentNameMap();

  // Aggregate by owner_user_id
  const managers = {};
  rows.forEach(r => {
    const uid = r.owner_user_id || r.owner_display_name;
    if (!managers[uid]) managers[uid] = { uid, totalEff: 0, totalLeft: 0, count: 0 };
    managers[uid].totalEff  += parseFloat(r.efficiency || 0);
    managers[uid].totalLeft += parseFloat(r.points_left || 0);
    managers[uid].count++;
  });

  const sorted = Object.values(managers).map(m => ({
    ...m,
    name:     displayName(m.uid, nm),
    avgEff:   m.totalEff / m.count,
    avgLeft:  m.totalLeft / m.count,
  })).sort((a, b) => a.avgEff - b.avgEff); // worst first

  // Worst sits — keyed by user_id for name lookup
  const worstSits = rows
    .filter(r => r.worst_sit?.points_diff > 0)
    .sort((a, b) => b.worst_sit.points_diff - a.worst_sit.points_diff)
    .slice(0, 10);

  const bestWeeks  = [...rows].sort((a, b) => b.efficiency - a.efficiency).slice(0, 5);
  const worstWeeks = [...rows].sort((a, b) => a.efficiency - b.efficiency).slice(0, 5);

  wrap.innerHTML = `
    <div class="lh-section-title">All-Time Lineup Efficiency</div>
    <div class="lh-table">
      <div class="lh-table-head">
        <span>Manager</span><span>Avg Eff%</span><span>Avg Left</span><span>Total Left</span>
      </div>
      ${sorted.map((m, i) => {
        const color = m.avgEff >= 90 ? 'var(--green)' : m.avgEff >= 80 ? 'var(--gold)' : 'var(--red)';
        return `<div class="lh-table-row">
          <span class="lh-name">${i === 0 ? '😬 ' : ''}${m.name}</span>
          <span style="color:${color};font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700">${m.avgEff.toFixed(1)}%</span>
          <span class="lh-muted">${m.avgLeft.toFixed(1)}</span>
          <span class="lh-muted">${m.totalLeft.toFixed(1)}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="lh-section-title" style="margin-top:24px">💀 Hall of Shame — Worst Sits Ever</div>
    <div class="lh-cards">
      ${worstSits.map(r => {
        const name = displayName(r.owner_user_id || r.owner_display_name, nm);
        return `
        <div class="lh-shame-card">
          <div class="lh-shame-header">
            <span class="lh-shame-name">${name}</span>
            <span class="lh-shame-meta">${r.season} · Wk ${r.week}</span>
          </div>
          <div class="lh-shame-body">
            <div class="lh-shame-benched">
              <div class="lh-shame-pts" style="color:var(--green)">${parseFloat(r.worst_sit.benched_pts).toFixed(1)}</div>
              <div class="lh-shame-player">${r.worst_sit.benched_name}</div>
              <div class="lh-shame-label">Benched</div>
            </div>
            <div class="lh-shame-vs">vs</div>
            <div class="lh-shame-started">
              <div class="lh-shame-pts" style="color:var(--red)">${parseFloat(r.worst_sit.started_pts).toFixed(1)}</div>
              <div class="lh-shame-player">${r.worst_sit.started_name}</div>
              <div class="lh-shame-label">Started</div>
            </div>
            <div class="lh-shame-diff">+${parseFloat(r.worst_sit.points_diff).toFixed(1)} left on bench</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="lh-two-col" style="margin-top:24px">
      <div>
        <div class="lh-section-title">🏆 Most Efficient Weeks</div>
        ${bestWeeks.map(r => `
          <div class="lh-stat-row">
            <div>
              <div class="lh-stat-name">${displayName(r.owner_user_id || r.owner_display_name, nm)}</div>
              <div class="lh-stat-meta">${r.season} · Wk ${r.week}</div>
            </div>
            <div class="lh-stat-val" style="color:var(--green)">${parseFloat(r.efficiency).toFixed(1)}%</div>
          </div>`).join('')}
      </div>
      <div>
        <div class="lh-section-title">💩 Least Efficient Weeks</div>
        ${worstWeeks.map(r => `
          <div class="lh-stat-row">
            <div>
              <div class="lh-stat-name">${displayName(r.owner_user_id || r.owner_display_name, nm)}</div>
              <div class="lh-stat-meta">${r.season} · Wk ${r.week}</div>
            </div>
            <div class="lh-stat-val" style="color:var(--red)">${parseFloat(r.efficiency).toFixed(1)}%</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── SEASONS TAB ──────────────────────────────────────────────────────────────

async function renderSeasonsTab(wrap) {
  const [{ data: matchups }, { data: seasons }] = await Promise.all([
    getSB().from('historical_matchups').select('*').eq('league_id', currentLeague.id),
    getSB().from('historical_seasons').select('*').eq('league_id', currentLeague.id).order('season', { ascending: false }),
  ]);

  if (!matchups?.length) {
    wrap.innerHTML = '<div class="empty-state">No season data yet.</div>'; return;
  }

  const nm = currentNameMap();

  wrap.innerHTML = seasons.map(s => {
    const sm = matchups.filter(m => m.season === s.season);
    if (!sm.length) return '';

    // Aggregate by owner_user_id
    const managerMap = {};
    sm.forEach(m => {
      const uid = m.owner_user_id || m.owner_display_name;
      if (!managerMap[uid]) managerMap[uid] = { uid, wins: 0, losses: 0, pts: 0 };
      const mg = managerMap[uid];
      if (m.won === true)  mg.wins++;
      if (m.won === false) mg.losses++;
      mg.pts += parseFloat(m.points || 0);
    });

    const standings = Object.values(managerMap)
      .map(m => ({ ...m, name: displayName(m.uid, nm) }))
      .sort((a, b) => b.wins - a.wins || b.pts - a.pts);

    const highScore = [...sm].sort((a, b) => b.points - a.points)[0];
    const highName  = highScore ? displayName(highScore.owner_user_id || highScore.owner_display_name, nm) : '';

    return `
      <div class="lh-season-block">
        <div class="lh-season-header">
          <div class="lh-season-year">${s.season}</div>
          <div class="lh-season-name">${s.league_name}</div>
        </div>
        <div class="lh-season-champion">🏆 ${standings[0]?.name || '—'} (${standings[0]?.wins}-${standings[0]?.losses})</div>
        <div class="lh-table" style="margin-top:10px">
          <div class="lh-table-head"><span>Manager</span><span>W-L</span><span>Pts</span></div>
          ${standings.map((m, i) => `
            <div class="lh-table-row">
              <span class="lh-name">${i === 0 ? '👑 ' : ''}${m.name}</span>
              <span class="lh-muted">${m.wins}-${m.losses}</span>
              <span class="lh-muted">${m.pts.toFixed(1)}</span>
            </div>`).join('')}
        </div>
        ${highScore ? `<div class="lh-season-stat">⚡ High score: ${highName} — ${parseFloat(highScore.points).toFixed(1)} pts (Wk ${highScore.week})</div>` : ''}
      </div>`;
  }).join('');
}

// ── RECORDS TAB ──────────────────────────────────────────────────────────────

async function renderRecordsTab(wrap) {
  const { data: matchups } = await getSB().from('historical_matchups')
    .select('*').eq('league_id', currentLeague.id);

  if (!matchups?.length) {
    wrap.innerHTML = '<div class="empty-state">No records data yet.</div>'; return;
  }

  const nm = currentNameMap();

  // Aggregate by owner_user_id
  const managers = {};
  matchups.forEach(m => {
    const uid = m.owner_user_id || m.owner_display_name;
    if (!managers[uid]) {
      managers[uid] = {
        uid, wins: 0, losses: 0, pts: 0, ptsAgainst: 0, weeks: 0,
        highScore: 0, highScoreWeek: null,
        lowScore: Infinity, lowScoreWeek: null,
        biggestWin: 0, biggestWinWeek: null,
      };
    }
    const mg = managers[uid];
    const pts    = parseFloat(m.points || 0);
    const oppPts = parseFloat(m.opponent_points || 0);
    if (m.won === true)  mg.wins++;
    if (m.won === false) mg.losses++;
    mg.pts += pts; mg.ptsAgainst += oppPts; mg.weeks++;
    if (pts > mg.highScore) { mg.highScore = pts; mg.highScoreWeek = `${m.season} Wk${m.week}`; }
    if (pts < mg.lowScore && pts > 0) { mg.lowScore = pts; mg.lowScoreWeek = `${m.season} Wk${m.week}`; }
    if (m.won && (pts - oppPts) > mg.biggestWin) {
      mg.biggestWin = pts - oppPts; mg.biggestWinWeek = `${m.season} Wk${m.week}`;
    }
  });

  const sorted = Object.values(managers).map(m => ({
    ...m,
    name:    displayName(m.uid, nm),
    winPct:  m.weeks ? ((m.wins / m.weeks) * 100).toFixed(1) : '0.0',
    avgPts:  m.weeks ? (m.pts / m.weeks).toFixed(1) : '0.0',
  })).sort((a, b) => b.wins - a.wins || b.pts - a.pts);

  // League-wide records
  const all          = matchups.filter(m => m.points > 0);
  const highestGame  = [...all].sort((a, b) => b.points - a.points)[0];
  const lowestGame   = [...all].sort((a, b) => a.points - b.points)[0];
  const biggestBlowout = matchups
    .filter(m => m.won && m.opponent_points !== null)
    .sort((a, b) => (b.points - b.opponent_points) - (a.points - a.opponent_points))[0];
  const closestGame = matchups
    .filter(m => m.won && m.opponent_points !== null)
    .sort((a, b) => Math.abs(a.points - a.opponent_points) - Math.abs(b.points - b.opponent_points))[0];

  const rName = r => displayName(r.owner_user_id || r.owner_display_name, nm);

  wrap.innerHTML = `
    <div class="lh-section-title">All-Time Standings</div>
    <div class="lh-table">
      <div class="lh-table-head"><span>Manager</span><span>W-L</span><span>Win%</span><span>Avg Pts</span></div>
      ${sorted.map(m => `
        <div class="lh-table-row">
          <span class="lh-name">${m.name}</span>
          <span class="lh-muted">${m.wins}-${m.losses}</span>
          <span style="color:var(--gold);font-family:'Barlow Condensed',sans-serif;font-size:14px">${m.winPct}%</span>
          <span class="lh-muted">${m.avgPts}</span>
        </div>`).join('')}
    </div>

    <div class="lh-section-title" style="margin-top:24px">League Records</div>
    <div class="lh-records-grid">
      ${highestGame  ? `<div class="lh-record-card"><div class="lh-record-label">Highest Score Ever</div><div class="lh-record-val">${parseFloat(highestGame.points).toFixed(1)}</div><div class="lh-record-who">${rName(highestGame)} · ${highestGame.season} Wk${highestGame.week}</div></div>` : ''}
      ${lowestGame   ? `<div class="lh-record-card"><div class="lh-record-label">Lowest Score Ever</div><div class="lh-record-val" style="color:var(--red)">${parseFloat(lowestGame.points).toFixed(1)}</div><div class="lh-record-who">${rName(lowestGame)} · ${lowestGame.season} Wk${lowestGame.week}</div></div>` : ''}
      ${biggestBlowout ? `<div class="lh-record-card"><div class="lh-record-label">Biggest Blowout</div><div class="lh-record-val">${(biggestBlowout.points - biggestBlowout.opponent_points).toFixed(1)}</div><div class="lh-record-who">${rName(biggestBlowout)} · ${biggestBlowout.season} Wk${biggestBlowout.week}</div></div>` : ''}
      ${closestGame  ? `<div class="lh-record-card"><div class="lh-record-label">Closest Game</div><div class="lh-record-val" style="color:var(--teal)">${Math.abs(closestGame.points - closestGame.opponent_points).toFixed(1)}</div><div class="lh-record-who">${rName(closestGame)} · ${closestGame.season} Wk${closestGame.week}</div></div>` : ''}
    </div>

    <div class="lh-section-title" style="margin-top:24px">Manager Records</div>
    ${sorted.map(m => `
      <div class="lh-manager-record">
        <div class="lh-manager-name">${m.name}</div>
        <div class="lh-manager-stats">
          <span>High: <strong>${m.highScore.toFixed(1)}</strong> <span class="lh-muted">(${m.highScoreWeek || '—'})</span></span>
          <span>Low: <strong>${m.lowScore === Infinity ? '—' : m.lowScore.toFixed(1)}</strong> <span class="lh-muted">(${m.lowScoreWeek || '—'})</span></span>
          <span>Biggest W: <strong>+${m.biggestWin.toFixed(1)}</strong> <span class="lh-muted">(${m.biggestWinWeek || '—'})</span></span>
        </div>
      </div>`).join('')}`;
}

// ── HEAD TO HEAD TAB ─────────────────────────────────────────────────────────

async function renderH2HTab(wrap) {
  const { data: matchups } = await getSB().from('historical_matchups')
    .select('*').eq('league_id', currentLeague.id);

  if (!matchups?.length) {
    wrap.innerHTML = '<div class="empty-state">No H2H data yet.</div>'; return;
  }

  const nm = currentNameMap();

  // Unique user IDs
  const userIds = [...new Set(matchups.map(m => m.owner_user_id || m.owner_display_name))];

  // Build H2H matrix keyed on user_id pairs
  const h2h = {};
  matchups.forEach(m => {
    if (!m.opponent_roster_id || m.won === null) return;
    const opp = matchups.find(x =>
      x.roster_id === m.opponent_roster_id &&
      x.season === m.season && x.week === m.week
    );
    if (!opp) return;
    const myUid  = m.owner_user_id   || m.owner_display_name;
    const oppUid = opp.owner_user_id || opp.owner_display_name;
    const key = `${myUid}|${oppUid}`;
    if (!h2h[key]) h2h[key] = { wins: 0, losses: 0, ptsFor: 0, ptsAgainst: 0 };
    if (m.won) h2h[key].wins++;
    else h2h[key].losses++;
    h2h[key].ptsFor     += parseFloat(m.points || 0);
    h2h[key].ptsAgainst += parseFloat(opp.points || 0);
  });

  wrap.innerHTML = `
    <div class="lh-section-title">Head-to-Head Records</div>
    <div class="field" style="margin-bottom:16px">
      <label class="field-label">View records for</label>
      <select class="field-input" id="h2h-select" onchange="renderH2HDetail(this.value)"
        style="max-width:280px">
        ${userIds.map(uid => `<option value="${uid}">${displayName(uid, nm)}</option>`).join('')}
      </select>
    </div>
    <div id="h2h-detail"></div>`;

  // Store data on element for reuse
  const sel = document.getElementById('h2h-select');
  sel._h2h     = h2h;
  sel._userIds = userIds;
  sel._nm      = nm;

  renderH2HDetail(userIds[0]);
}

function renderH2HDetail(selectedUid) {
  const sel      = document.getElementById('h2h-select');
  const h2h      = sel._h2h;
  const userIds  = sel._userIds;
  const nm       = sel._nm;
  const detail   = document.getElementById('h2h-detail');
  if (!detail || !h2h) return;

  const rows = userIds
    .filter(uid => uid !== selectedUid)
    .map(oppUid => {
      const key = `${selectedUid}|${oppUid}`;
      const rec = h2h[key] || { wins: 0, losses: 0, ptsFor: 0, ptsAgainst: 0 };
      return { oppUid, oppName: displayName(oppUid, nm), ...rec };
    })
    .sort((a, b) => b.wins - a.wins);

  detail.innerHTML = `
    <div class="lh-table">
      <div class="lh-table-head">
        <span>Opponent</span><span>W-L</span><span>Pts For</span><span>Pts Against</span>
      </div>
      ${rows.map(r => {
        const color = r.wins > r.losses ? 'var(--green)' : r.wins < r.losses ? 'var(--red)' : 'var(--text2)';
        return `<div class="lh-table-row">
          <span class="lh-name">${r.oppName}</span>
          <span style="color:${color};font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700">${r.wins}-${r.losses}</span>
          <span class="lh-muted">${r.ptsFor.toFixed(1)}</span>
          <span class="lh-muted">${r.ptsAgainst.toFixed(1)}</span>
        </div>`;
      }).join('')}
    </div>`;
}
