// ═══════════════════════════════════════════════
//  HOME PAGE — dashboard
// ═══════════════════════════════════════════════

async function renderHomePage() {
  if (!leagueData) return;
  const { sr, um } = leagueData;
  document.getElementById('home-week-chip').textContent = `Week ${currentWeek}`;

  // Hide all cards initially
  ['home-matchup-card','home-ranking-card','home-summary-card',
   'home-votes-card','home-proposals-card'].forEach(id => hide(id));

  // Run all in parallel
  await Promise.all([
    renderHomeMatchup(sr, um),
    renderHomeRanking(sr, um),
    renderHomeSummary(),
    renderHomeVotes(),
    renderHomeProposals(),
  ]);
}

async function renderHomeMatchup(sr, um) {
  try {
    const matchups = await getMatchups(currentLeague.id, currentWeek);
    const myRoster = sr.find(r => r.owner_id === currentUser.user_id);
    if (!myRoster) return;

    const myMatchup = matchups.find(m => m.roster_id === myRoster.roster_id);
    if (!myMatchup) return;

    const opponent = matchups.find(m =>
      m.matchup_id === myMatchup.matchup_id && m.roster_id !== myRoster.roster_id
    );
    if (!opponent) return;

    const oppRoster  = sr.find(r => r.roster_id === opponent.roster_id);
    const myPts      = myMatchup.points?.toFixed(1)  ?? '—';
    const oppPts     = opponent.points?.toFixed(1)   ?? '—';
    const myName     = teamName(myRoster, um);
    const oppName    = oppRoster ? teamName(oppRoster, um) : `Roster ${opponent.roster_id}`;

    const card = document.getElementById('home-matchup-card');
    card.innerHTML = `
      <div class="home-card-label">Your Matchup — Week ${currentWeek}</div>
      <div class="home-matchup">
        <div class="home-matchup-team">
          <div class="home-matchup-name">${myName}</div>
          <div class="home-matchup-pts">${myPts}</div>
        </div>
        <div class="home-matchup-vs">VS</div>
        <div class="home-matchup-team">
          <div class="home-matchup-name">${oppName}</div>
          <div class="home-matchup-pts">${oppPts}</div>
        </div>
      </div>`;
    show('home-matchup-card');
  } catch {}
}

async function renderHomeRanking(sr, um) {
  try {
    const { data: history } = await getSB().from('ranking_history')
      .select('rank').eq('league_id', currentLeague.id).eq('week', currentWeek)
      .eq('roster_id', String(sr.find(r => r.owner_id === currentUser.user_id)?.roster_id))
      .single();

    if (!history) return;

    const prevRankings = await getWeekRankings(currentLeague.id, currentWeek - 1);
    const myRoster = sr.find(r => r.owner_id === currentUser.user_id);
    const rid = String(myRoster?.roster_id);
    const prev = prevRankings[rid];
    const cur  = history.rank;
    let moveEl = '';
    if (prev !== undefined) {
      const diff = prev - cur;
      if (diff > 0)      moveEl = `<span class="move-up">▲${diff} from last week</span>`;
      else if (diff < 0) moveEl = `<span class="move-dn">▼${Math.abs(diff)} from last week</span>`;
      else               moveEl = `<span class="move-eq">Unchanged from last week</span>`;
    }

    const card = document.getElementById('home-ranking-card');
    card.innerHTML = `
      <div class="home-card-label">Your Power Ranking</div>
      <div class="home-ranking-row">
        <div class="home-ranking-num">#${cur}</div>
        <div class="home-ranking-info">
          <div class="home-ranking-label">${teamName(myRoster, um)}</div>
          <div class="home-ranking-move">${moveEl}</div>
        </div>
      </div>
      <span class="home-card-link" onclick="switchPage('rankings', document.querySelector('.tnav-item:nth-child(3)'))">View full rankings →</span>`;
    show('home-ranking-card');
  } catch {}
}

async function renderHomeSummary() {
  try {
    const row = await getSummary(currentLeague.id, currentWeek);
    if (!row?.summary_text) return;

    const card = document.getElementById('home-summary-card');
    card.innerHTML = `
      <div class="home-card-label">Week ${currentWeek} Summary</div>
      <div class="home-summary-snippet">${row.summary_text}</div>
      <span class="home-card-link" onclick="switchPage('summary', document.querySelector('.tnav-item:nth-child(4)'))">Read full summary →</span>`;
    show('home-summary-card');
  } catch {}
}

async function renderHomeVotes() {
  try {
    const votes = await getVotesForWeek(currentLeague.id, currentWeek);
    const total = leagueData.sr.length;
    const myVote = votes.find(v => v.voter_user_id === currentUser.user_id);

    const card = document.getElementById('home-votes-card');
    card.innerHTML = `
      <div class="home-card-label">Power Rankings Vote</div>
      <div class="home-vote-row">
        <span class="home-vote-count">${votes.length} / ${total} votes in</span>
        <span style="font-size:12px;color:${myVote ? 'var(--green)' : 'var(--gold)'}">${myVote ? '✓ You voted' : '⚡ You haven\'t voted yet'}</span>
      </div>
      ${!myVote ? `<span class="home-card-link" onclick="switchPage('vote', document.querySelector('.tnav-item:nth-child(2)'))">Submit your rankings →</span>` : ''}`;
    show('home-votes-card');
  } catch {}
}

async function renderHomeProposals() {
  try {
    const { data: proposals } = await getSB().from('proposals')
      .select('*').eq('league_id', currentLeague.id)
      .order('created_at', { ascending: false }).limit(3);

    if (!proposals?.length) return;

    const card = document.getElementById('home-proposals-card');
    card.innerHTML = `
      <div class="home-card-label">Recent Proposals</div>
      ${proposals.map(p => `
        <div class="home-prop-row" onclick="switchPage('proposals', document.querySelector('.tnav-item:nth-child(6)'))">
          <div class="home-prop-title">${p.title}</div>
          <div class="home-prop-meta">${p.is_anonymous ? 'Anonymous' : p.author_display_name} · ${timeAgo(p.created_at)} · <span class="proposal-status status-${p.status}">${p.status}</span></div>
        </div>`).join('')}
      <span class="home-card-link" onclick="switchPage('proposals', document.querySelector('.tnav-item:nth-child(6)'))">View all proposals →</span>`;
    show('home-proposals-card');
  } catch {}
}
