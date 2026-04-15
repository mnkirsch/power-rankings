// ═══════════════════════════════════════════════
//  COMMISSIONER PAGE — cross-league proposal view
// ═══════════════════════════════════════════════

async function renderCommissionerPage() {
  if (!isCommissioner) return;

  const wrap = document.getElementById('comm-content');
  wrap.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

  try {
    // Load all leagues commissioner is in
    const leagueBlocks = [];
    for (const id of CONFIG.leagueIds) {
      try {
        const [info, proposals] = await Promise.all([
          getLeague(id),
          getSB().from('proposals').select('*, proposal_votes(count), proposal_replies(count)')
            .eq('league_id', id).order('created_at', { ascending: false })
            .then(r => r.data || []),
        ]);
        leagueBlocks.push({ info, proposals });
      } catch {}
    }

    wrap.innerHTML = '';
    leagueBlocks.forEach(({ info, proposals }) => {
      const block = document.createElement('div');
      block.className = 'comm-league-block';
      block.innerHTML = `<div class="comm-league-name">${info.name}</div>` +
        (proposals.length
          ? proposals.map(p => buildCommProposalRow(p)).join('')
          : `<div class="comm-empty">No proposals in this league yet.</div>`);
      wrap.appendChild(block);
    });

  } catch(e) {
    wrap.innerHTML = `<div class="empty-state">Error loading commissioner data: ${e.message}</div>`;
  }
}

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
  if (!deadline) {
    showToast('Set a deadline first.', true); return;
  }

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
