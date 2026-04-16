// ═══════════════════════════════════════════════
//  HISTORY IMPORT ENGINE
//  Chains through previous_league_id back to 2018,
//  fetches all matchups, computes efficiency,
//  stores everything in Supabase.
// ═══════════════════════════════════════════════

const IMPORT_DELAY_MS = 200; // ms between API calls to respect rate limit
const NFL_WEEKS = { regular: 17, '2021': 18, '2022': 18, '2023': 18, '2024': 18, '2025': 18 };

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── LOG HELPER ───────────────────────────────────────────────────────────────
// Writes status to the import log UI in the commissioner page

function importLog(leagueDbId, msg, isError = false) {
  const el = document.getElementById(`import-log-${leagueDbId}`);
  if (!el) return;
  const line = document.createElement('div');
  line.style.cssText = `font-size:12px;line-height:1.6;color:${isError ? 'var(--red)' : 'var(--text2)'};`;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function importLogSuccess(leagueDbId, msg) {
  const el = document.getElementById(`import-log-${leagueDbId}`);
  if (!el) return;
  const line = document.createElement('div');
  line.style.cssText = 'font-size:12px;line-height:1.6;color:var(--green);font-weight:600;';
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ── MAIN IMPORT ──────────────────────────────────────────────────────────────

async function runHistoricalImport(leagueDbId, currentSleeperLeagueId) {
  const btn = document.getElementById(`import-btn-${leagueDbId}`);
  btn.disabled = true; btn.textContent = 'Importing…';

  const logEl = document.getElementById(`import-log-${leagueDbId}`);
  logEl.innerHTML = '';
  logEl.style.display = 'block';

  try {
    // Step 1: Discover all historical league IDs by chaining previous_league_id
    importLog(leagueDbId, '🔍 Discovering historical seasons…');
    const seasons = await discoverSeasons(leagueDbId, currentSleeperLeagueId);
    importLog(leagueDbId, `Found ${seasons.length} season(s): ${seasons.map(s => s.season).join(', ')}`);

    // Step 2: Fetch player DB once (needed for efficiency calc)
    importLog(leagueDbId, '📦 Fetching player database…');
    if (!playersCache) {
      playersCache = await getAllPlayers();
    }
    importLog(leagueDbId, `Player database loaded (${Object.keys(playersCache).length} players)`);

    // Step 3: Process each season
    for (const season of seasons) {
      await importSeason(leagueDbId, season);
    }

    importLogSuccess(leagueDbId, '✅ Import complete! All historical data loaded.');
  } catch(e) {
    importLog(leagueDbId, `❌ Import failed: ${e.message}`, true);
    console.error(e);
  }

  btn.disabled = false; btn.textContent = 'Import History';
}

// ── DISCOVER SEASONS ─────────────────────────────────────────────────────────

async function discoverSeasons(leagueDbId, startingLeagueId) {
  const seasons = [];
  let leagueId = startingLeagueId;

  while (leagueId) {
    try {
      await delay(IMPORT_DELAY_MS);
      const info = await slGet(`/league/${leagueId}`);
      if (!info) break;

      seasons.unshift({
        sleeper_league_id: leagueId,
        season: info.season,
        league_name: info.name,
        total_rosters: info.total_rosters,
        previous_league_id: info.previous_league_id,
      });

      // Save season record to Supabase
      await getSB().from('historical_seasons').upsert({
        league_id: leagueDbId,
        season: info.season,
        sleeper_league_id: leagueId,
        league_name: info.name,
        total_rosters: info.total_rosters,
      }, { onConflict: 'league_id,season' });

      leagueId = info.previous_league_id || null;

      // Stop at 2018
      if (parseInt(info.season) <= 2017) break;
    } catch(e) {
      importLog(leagueDbId, `Warning: couldn't fetch league ${leagueId}: ${e.message}`);
      break;
    }
  }

  return seasons;
}

// ── IMPORT ONE SEASON ────────────────────────────────────────────────────────

async function importSeason(leagueDbId, season) {
  importLog(leagueDbId, `\n📅 Processing ${season.season} season…`);

  // Fetch users and rosters for this season
  await delay(IMPORT_DELAY_MS);
  const [users, rosters] = await Promise.all([
    slGet(`/league/${season.sleeper_league_id}/users`),
    slGet(`/league/${season.sleeper_league_id}/rosters`),
  ]);
  await delay(IMPORT_DELAY_MS);

  const um = buildUsersMap(users || []);
  const rosterMap = {};
  (rosters || []).forEach(r => rosterMap[r.roster_id] = r);

  // Determine number of regular season weeks
  const seasonYear = parseInt(season.season);
  const numWeeks = seasonYear >= 2021 ? 18 : 17;

  // Fetch all weeks
  for (let week = 1; week <= numWeeks; week++) {
    await delay(IMPORT_DELAY_MS);
    try {
      const matchups = await slGet(`/league/${season.sleeper_league_id}/matchups/${week}`);
      if (!matchups?.length) continue;

      importLog(leagueDbId, `  Week ${week}: ${matchups.length} roster entries`);

      // Pair matchups by matchup_id
      const paired = {};
      matchups.forEach(m => {
        if (!paired[m.matchup_id]) paired[m.matchup_id] = [];
        paired[m.matchup_id].push(m);
      });

      // Process each team's matchup
      const matchupRows = [];
      const efficiencyRows = [];

      for (const matchup of matchups) {
        const roster = rosterMap[matchup.roster_id];
        if (!roster) continue;

        const u = um[roster.owner_id] || {};
        const pair = paired[matchup.matchup_id] || [];
        const opponent = pair.find(m => m.roster_id !== matchup.roster_id);

        const starters = matchup.starters || [];
        const players  = matchup.players  || [];
        const playerPts = matchup.players_points || {};
        const rosterPositions = []; // We'll use generic flex calc

        // Compute efficiency
        const bench = players.filter(pid => !starters.includes(pid));
        const actualPts  = starters.reduce((s, pid) => s + (playerPts[pid] || 0), 0);
        const optimalPts = computeOptimalScoreGeneric(starters, bench, playerPts, playersCache);
        const efficiency = optimalPts > 0 ? Math.min(100, (actualPts / optimalPts) * 100) : null;
        const pointsLeft = optimalPts > 0 ? optimalPts - actualPts : 0;

        // Find worst sit (bench player who outscored a starter the most)
        let worstSit = null;
        if (bench.length && starters.length) {
          const starterMin = Math.min(...starters.map(s => playerPts[s] || 0));
          const starterMinPid = starters.find(s => (playerPts[s] || 0) === starterMin);
          let maxBenchPts = 0;
          let maxBenchPid = null;
          bench.forEach(pid => {
            const pts = playerPts[pid] || 0;
            if (pts > maxBenchPts) { maxBenchPts = pts; maxBenchPid = pid; }
          });
          if (maxBenchPid && maxBenchPts > starterMin) {
            const benchPlayer  = playersCache?.[maxBenchPid];
            const startedPlayer = playersCache?.[starterMinPid];
            worstSit = {
              benched_id:    maxBenchPid,
              benched_name:  benchPlayer ? `${benchPlayer.first_name} ${benchPlayer.last_name}` : maxBenchPid,
              benched_pts:   maxBenchPts,
              started_id:    starterMinPid,
              started_name:  startedPlayer ? `${startedPlayer.first_name} ${startedPlayer.last_name}` : starterMinPid,
              started_pts:   starterMin,
              points_diff:   maxBenchPts - starterMin,
            };
          }
        }

        const tName = u?.metadata?.team_name || u?.display_name || `Team ${matchup.roster_id}`;

        matchupRows.push({
          league_id:           leagueDbId,
          season:              season.season,
          week,
          roster_id:           matchup.roster_id,
          owner_user_id:       roster.owner_id,
          owner_display_name:  u?.display_name || '',
          team_name:           tName,
          matchup_id:          matchup.matchup_id,
          points:              matchup.points || 0,
          opponent_roster_id:  opponent?.roster_id || null,
          opponent_points:     opponent?.points || null,
          won:                 opponent ? (matchup.points || 0) > (opponent.points || 0) : null,
          starters:            starters,
          players:             players,
          players_points:      playerPts,
        });

        if (efficiency !== null) {
          efficiencyRows.push({
            league_id:          leagueDbId,
            season:             season.season,
            week,
            roster_id:          matchup.roster_id,
            owner_user_id:      roster.owner_id,
            owner_display_name: u?.display_name || '',
            team_name:          tName,
            actual_points:      actualPts,
            optimal_points:     optimalPts,
            efficiency:         parseFloat(efficiency.toFixed(2)),
            points_left:        parseFloat(pointsLeft.toFixed(2)),
            worst_sit:          worstSit,
          });
        }
      }

      // Batch upsert
      if (matchupRows.length) {
        await getSB().from('historical_matchups').upsert(
          matchupRows, { onConflict: 'league_id,season,week,roster_id' }
        );
      }
      if (efficiencyRows.length) {
        await getSB().from('historical_efficiency').upsert(
          efficiencyRows, { onConflict: 'league_id,season,week,roster_id' }
        );
      }

    } catch(e) {
      importLog(leagueDbId, `  Week ${week}: skipped (${e.message})`);
    }
  }

  importLogSuccess(leagueDbId, `✓ ${season.season} complete`);
}

// ── OPTIMAL SCORE (generic — no roster positions needed) ─────────────────────
// Uses position eligibility rules rather than specific roster slot config
// since we don't have historical roster position settings easily available

function computeOptimalScoreGeneric(starters, bench, playerPts, players) {
  const all = [...starters, ...bench]
    .map(pid => ({
      pid,
      pts: playerPts[pid] || 0,
      pos: players?.[pid]?.position || 'WR',
    }))
    .sort((a, b) => b.pts - a.pts);

  // Count starter slots by position
  const slotCounts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, FLEX: 0 };
  starters.forEach(pid => {
    const pos = players?.[pid]?.position || 'WR';
    if (slotCounts[pos] !== undefined) slotCounts[pos]++;
    else slotCounts.FLEX++;
  });

  let total = 0;
  const used = new Set();

  // Fill each position with best available
  const positions = ['QB','K','DEF'];
  positions.forEach(pos => {
    for (let i = 0; i < (slotCounts[pos] || 0); i++) {
      const best = all.find(p => !used.has(p.pid) && p.pos === pos);
      if (best) { total += best.pts; used.add(best.pid); }
    }
  });

  // RB, WR, TE
  ['RB','WR','TE'].forEach(pos => {
    for (let i = 0; i < (slotCounts[pos] || 0); i++) {
      const best = all.find(p => !used.has(p.pid) && p.pos === pos);
      if (best) { total += best.pts; used.add(best.pid); }
    }
  });

  // Flex — best remaining skill player
  for (let i = 0; i < (slotCounts.FLEX || 0); i++) {
    const best = all.find(p => !used.has(p.pid) && ['RB','WR','TE'].includes(p.pos));
    if (best) { total += best.pts; used.add(best.pid); }
  }

  return total;
}
