// ═══════════════════════════════════════════════
//  COMMISSIONER PAGE
// ═══════════════════════════════════════════════

async function renderCommissionerPage() {
  if (!isCommissioner) return;

  const wrap = document.getElementById('comm-content');
  wrap.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

  try {
    const leagueBlocks = [];
    for (const id of CONFIG.leagueIds) {
      try {
        const [info, proposals, settings] = await Promise.all([
          getLeague(id),
          getSB().from('proposals')
            .select('*, proposal_votes(count), proposal_replies(count)')
            .eq('league_id', id)
            .order('created_at', { ascending: false })
            .then(r => r.data || []),
          getLeagueSettings(id),
        ]);
        leagueBlocks.push({ info, proposals, settings });
      } catch {}
    }

    wrap.innerHTML = '';
    leagueBlocks.forEach(({ info, proposals, settings }) => {
      const activeWeek = settings?.active_week ?? 0;
      const block = document.createElement('div');
      block.className = 'comm-league-block';
      block.innerHTML = `
        <div class="comm-league-name">${info.name}</div>

        <!-- Season Controls -->
        <div class="comm-controls">
          <div class="comm-controls-title">Season Controls</div>
          <div class="comm-controls-row">
            <div class="comm-controls-info">
              <div class="comm-controls-label">Active Week</div>
              <div class="comm-controls-value">${weekLabel(activeWeek)}</div>
            </div>
            <div class="comm-controls-actions">
              <input type="number" class="deadline-input" id="week-input-${info.league_id}"
                min="0" max="18" value="${activeWeek}" style="width:70px;text-align:center"/>
              <button class="btn-put-vote" onclick="setActiveWeek('${info.league_id}')">Set Week</button>
            </div>
          </div>
          <div class="comm-controls-row" style="margin-top:8px">
            <div class="comm-controls-info">
              <div class="comm-controls-label">Reset Votes</div>
              <div class="comm-controls-meta">Clears all power ranking votes for the active week</div>
            </div>
            <button class="btn-reset-votes" onclick="resetWeekVotes('${info.league_id}', ${activeWeek})">
              Reset ${weekLabel(activeWeek)}
            </button>
          </div>
        </div>

        <!-- Proposals -->
        <div class="section-label" style="margin-top:20px">Proposals</div>
        ${proposals.length
          ? proposals.map(p => buildCommProposalRow(p)).join('')
          : `<div class="comm-empty">No proposals yet.</div>`}`;
      wrap.appendChild(block);
    });

  } catch(e) {
    wrap.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

// ── WEEK CONTROLS ─────────────────────────────────────────────────────────────

async function setActiveWeek(leagueId) {
  const input = document.getElementById(`week-input-${leagueId}`);
  const week = parseInt(input.value);
  if (isNaN(week) || week < 0 || week > 18) {
    showToast('Enter a week between 0 and 18.', true); return;
  }
  try {
    await saveLeagueSettings(leagueId, week);
    // Update currentWeek if this is the active league
    if (leagueId === currentLeague.id) currentWeek = week;
    showToast(`Active week set to ${weekLabel(week)}!`);
    await renderCommissionerPage();
  } catch(e) {
    showToast('Failed: ' + e.message, true);
  }
}

async function resetWeekVotes(leagueId, week) {
  const label = weekLabel(week);
  if (!confirm(`Reset all power ranking votes for ${label} in this league? This cannot be undone.`)) return;
  try {
    const { error } = await getSB().from('votes')
      .delete()
      .eq('league_id', leagueId)
      .eq('week', week);
    if (error) throw error;
    // Also clear the ranking history snapshot for that week
    await getSB().from('ranking_history')
      .delete()
      .eq('league_id', leagueId)
      .eq('week', week);
    showToast(`${label} votes reset.`);
    await renderCommissionerPage();
  } catch(e) {
    showToast('Failed: ' + e.message, true);
  }
}

// ── PROPOSALS ─────────────────────────────────────────────────────────────────

function buildCommProposalRow(p) {
  const replyCount = p.proposal_replies?.[0]?.count ?? 0;
  const voteCount  = p.proposal_votes?.[0]?.count  ?? 0;

  let actions = '';
  if (p.status === 'open') {
    actions = `
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <input type="datetime-local" class="deadline-input" id="deadline-${p.id}" title="Vote deadline"/>
        <button class="btn-put-vote" onclick="putToVote('${p.id}')">Put to Vote</button>
      </div>`;
  } else if (p.status === 'voting') {
    actions = `<button class="btn-close-vote" onclick="closeVote('${p.id}')">Close Vote</button>`;
  } else {
    actions = `<span style="font-size:11px;color:var(--text3)">Closed</span>`;
  }

  return `
    <div class="comm-proposal-row">
      <div class="comm-proposal-info">
        <div class="comm-proposal-title">${p.title}</div>
        <div class="comm-proposal-meta">
          ${p.is_anonymous ? 'Anonymous' : p.author_display_name} ·
          ${timeAgo(p.created_at)} ·
          ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'} ·
          ${voteCount} vote${voteCount === 1 ? '' : 's'} ·
          <span class="proposal-status status-${p.status}">${p.status}</span>
        </div>
      </div>
      <div class="comm-proposal-actions">${actions}</div>
    </div>`;
}

async function putToVote(proposalId) {
  const deadlineInput = document.getElementById(`deadline-${proposalId}`);
  const deadline = deadlineInput?.value;
  if (!deadline) { showToast('Set a deadline first.', true); return; }
  try {
    const { error } = await getSB().from('proposals')
      .update({ status: 'voting', vote_deadline: new Date(deadline).toISOString() })
      .eq('id', proposalId);
    if (error) throw error;
    showToast('Proposal put to vote!');
    await renderCommissionerPage();
  } catch(e) {
    showToast('Failed: ' + e.message, true);
  }
}

async function closeVote(proposalId) {
  try {
    const { error } = await getSB().from('proposals')
      .update({ status: 'closed' })
      .eq('id', proposalId);
    if (error) throw error;
    showToast('Vote closed.');
    await renderCommissionerPage();
  } catch(e) {
    showToast('Failed: ' + e.message, true);
  }
}
