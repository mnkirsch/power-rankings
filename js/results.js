// ═══════════════════════════════════════════════
//  RESULTS PAGE
// ═══════════════════════════════════════════════

async function renderResultsPage() {
  if (!leagueData) return;
  const { sr, um } = leagueData;
  document.getElementById('res-week-chip').textContent = `Week ${currentWeek}`;

  const list = document.getElementById('results-list');
  list.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';
  hide('ballot-section');

  const votes = await getVotesForWeek(currentLeague.id, currentWeek);
  const voteCount = votes.length;

  list.innerHTML = '';
  if (!voteCount) {
    list.innerHTML = '<div class="empty-state">No votes yet this week.<br>Be the first to submit your rankings!</div>';
    return;
  }

  // Compute average rank per roster
  const scores = {};
  sr.forEach(r => {
    const rid = String(r.roster_id);
    const ranks = votes.map(v => v.rankings?.[rid]).filter(Boolean).map(Number);
    scores[rid] = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 999;
  });

  // Previous week for movement arrows
  const prevRankings = currentWeek > 1
    ? await getWeekRankings(currentLeague.id, currentWeek - 1)
    : {};

  const ranked = [...sr].sort((a, b) => scores[String(a.roster_id)] - scores[String(b.roster_id)]);

  ranked.forEach((r, i) => {
    const rid = String(r.roster_id);
    const avg = scores[rid];
    const rv = votes.filter(v => v.rankings?.[rid]).length;
    const pct = Math.max(5, ((sr.length - avg + 1) / sr.length) * 100);
    const rc = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'rest';
    const u = um[r.owner_id];

    let moveEl = '';
    if (prevRankings[rid] !== undefined) {
      const diff = prevRankings[rid] - (i + 1);
      if (diff > 0)      moveEl = `<span class="move-up">▲${diff}</span>`;
      else if (diff < 0) moveEl = `<span class="move-dn">▼${Math.abs(diff)}</span>`;
      else               moveEl = `<span class="move-eq">—</span>`;
    }

    const card = document.createElement('div');
    card.className = 'rcard';
    card.innerHTML = `
      <div class="rcard-rank ${rc}">${i + 1}</div>
      ${avatarDiv(u?.avatar, 'sm-av')}
      <div class="rcard-body">
        <div class="rcard-top">
          <span class="rcard-name">${teamName(r, um)} ${moveEl}</span>
          <span class="rcard-avg">avg #${avg.toFixed(1)}</span>
        </div>
        <div class="rcard-bar-bg"><div class="rcard-bar" style="width:${pct}%"></div></div>
        <div class="rcard-meta">
          <span>${rv}/${voteCount} votes</span>
          <span>·</span>
          <span>${ownerName(r, um)}</span>
        </div>
      </div>`;
    list.appendChild(card);
  });

  // Save snapshot for history
  const rows = ranked.map((r, i) => ({
    league_id:  currentLeague.id,
    week:       currentWeek,
    roster_id:  String(r.roster_id),
    team_name:  teamName(r, um),
    owner_name: ownerName(r, um),
    rank:       i + 1,
    avg_score:  scores[String(r.roster_id)],
  }));
  saveRankingHistory(rows).catch(() => {}); // fire and forget

  // Commissioner ballot breakdown
  if (isCommissioner && voteCount > 0) {
    show('ballot-section');
    renderBallots(votes, ranked, um);
  }
}

function renderBallots(votes, ranked, um) {
  const grid = document.getElementById('ballot-grid');
  grid.innerHTML = '';
  votes.forEach(vote => {
    const card = document.createElement('div');
    card.className = 'ballot-card';
    const picks = Object.entries(vote.rankings || {})
      .map(([rid, rank]) => ({ rid, rank }))
      .sort((a, b) => a.rank - b.rank);
    const voterName = vote.voter_display_name || vote.voter_username;
    card.innerHTML = `<div class="ballot-voter">👤 ${voterName}</div>` +
      picks.map(p => {
        const roster = leagueData.sr.find(r => String(r.roster_id) === String(p.rid));
        const name = roster ? teamName(roster, um) : `Team ${p.rid}`;
        return `<div class="ballot-row"><span class="ballot-num">${p.rank}</span><span>${name}</span></div>`;
      }).join('');
    grid.appendChild(card);
  });
}
