// ═══════════════════════════════════════════════
//  PROPOSALS PAGE — forum + voting
// ═══════════════════════════════════════════════

let currentProposalId = null;

// ── SUPABASE HELPERS ─────────────────────────────────────────────────────────

async function getProposals(leagueId) {
  const { data } = await getSB().from('proposals')
    .select('*').eq('league_id', leagueId)
    .order('created_at', { ascending: false });
  return data || [];
}

async function getProposal(id) {
  const { data } = await getSB().from('proposals').select('*').eq('id', id).single();
  return data;
}

async function getReplies(proposalId) {
  const { data } = await getSB().from('proposal_replies')
    .select('*').eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function getProposalVotes(proposalId) {
  const { data } = await getSB().from('proposal_votes')
    .select('*').eq('proposal_id', proposalId);
  return data || [];
}

// ── LIST VIEW ─────────────────────────────────────────────────────────────────

async function renderProposalsPage() {
  showProposalsList();
  await loadProposalsList();
}

async function loadProposalsList() {
  const proposals = await getProposals(currentLeague.id);
  const list = document.getElementById('proposals-list');

  if (!proposals.length) {
    list.innerHTML = '<div class="empty-state">No proposals yet.<br>Be the first to suggest a rule change!</div>';
    return;
  }

  list.innerHTML = proposals.map(p => `
    <div class="proposal-card" onclick="openProposal('${p.id}')">
      <div class="proposal-card-top">
        <div class="proposal-card-title">${p.title}</div>
        <span class="proposal-status status-${p.status}">${p.status}</span>
      </div>
      <div class="proposal-card-meta">
        <span>${p.is_anonymous ? 'Anonymous' : p.author_display_name}</span>
        <span>·</span>
        <span>${timeAgo(p.created_at)}</span>
      </div>
    </div>`).join('');
}

function showProposalsList() {
  show('proposals-list-view');
  hide('new-proposal-view');
  hide('proposal-detail-view');
}

function showNewProposalForm() {
  hide('proposals-list-view');
  show('new-proposal-view');
  hide('proposal-detail-view');
  clearErr('prop-err');
  document.getElementById('prop-title').value = '';
  document.getElementById('prop-body').value = '';
  document.getElementById('prop-anon').checked = false;
}

// ── NEW PROPOSAL ──────────────────────────────────────────────────────────────

async function submitProposal() {
  const title = document.getElementById('prop-title').value.trim();
  const body  = document.getElementById('prop-body').value.trim();
  const anon  = document.getElementById('prop-anon').checked;

  if (!title) { showErr('prop-err', 'Required', 'Add a title for your proposal.'); return; }
  if (!body)  { showErr('prop-err', 'Required', 'Add some details.'); return; }

  const btn = document.querySelector('#new-proposal-view .btn-primary');
  btn.disabled = true; btn.textContent = 'Submitting…';

  try {
    const { error } = await getSB().from('proposals').insert({
      league_id:          currentLeague.id,
      author_user_id:     currentUser.user_id,
      author_display_name: currentUser.display_name || currentUser.username,
      is_anonymous:       anon,
      title,
      body,
      status:             'open',
    });
    if (error) throw error;
    showToast('Proposal submitted!');
    showProposalsList();
    await loadProposalsList();
  } catch(e) {
    showErr('prop-err', 'Error', e.message);
  }
  btn.disabled = false; btn.textContent = 'Submit Proposal';
}

// ── PROPOSAL DETAIL ───────────────────────────────────────────────────────────

async function openProposal(id) {
  currentProposalId = id;
  hide('proposals-list-view');
  hide('new-proposal-view');
  show('proposal-detail-view');

  await loadProposalDetail(id);
}

async function loadProposalDetail(id) {
  const [proposal, replies, pvotes] = await Promise.all([
    getProposal(id),
    getReplies(id),
    getProposalVotes(id),
  ]);

  if (!proposal) return;

  // Main post
  const authorName = proposal.is_anonymous ? 'Anonymous' : proposal.author_display_name;
  document.getElementById('proposal-detail-content').innerHTML = `
    <div class="proposal-detail-card">
      <div class="proposal-detail-title">${proposal.title}</div>
      <div class="proposal-detail-meta">
        <span>${authorName}</span>
        <span>·</span>
        <span>${timeAgo(proposal.created_at)}</span>
        <span>·</span>
        <span class="proposal-status status-${proposal.status}">${proposal.status}</span>
      </div>
      <div class="proposal-detail-body">${proposal.body}</div>
    </div>`;

  // Vote banner
  const banner = document.getElementById('proposal-vote-banner');
  if (proposal.status === 'voting' || proposal.status === 'closed') {
    const yesVotes = pvotes.filter(v => v.vote === 'yes').length;
    const noVotes  = pvotes.filter(v => v.vote === 'no').length;
    const total    = pvotes.length;
    const yesPct   = total ? Math.round((yesVotes / total) * 100) : 0;
    const noPct    = total ? Math.round((noVotes  / total) * 100) : 0;
    const myVote   = pvotes.find(v => v.voter_user_id === currentUser.user_id);
    const deadline = proposal.vote_deadline
      ? new Date(proposal.vote_deadline).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
      : null;

    banner.innerHTML = `
      <div class="vote-banner">
        <div class="vote-banner-title">
          ${proposal.status === 'closed' ? '🔒 Vote Closed' : '🗳 Vote Open'}
        </div>
        ${deadline && proposal.status === 'voting' ? `<div class="vote-banner-deadline">Closes ${deadline}</div>` : ''}
        ${proposal.status === 'voting' && !myVote ? `
          <div class="vote-btns">
            <button class="btn-yes" onclick="castProposalVote('${id}','yes')">✓ Yes</button>
            <button class="btn-no"  onclick="castProposalVote('${id}','no')">✗ No</button>
          </div>` : ''}
        ${myVote ? `<div style="font-size:13px;color:var(--text2);margin-bottom:10px">You voted <strong style="color:${myVote.vote==='yes'?'var(--green)':'var(--red)'}">${myVote.vote}</strong></div>` : ''}
        <div class="vote-result-bar">
          <div class="vote-result-labels">
            <span class="vote-result-yes">Yes ${yesPct}% (${yesVotes})</span>
            <span class="vote-result-no">${noVotes} (${noPct}%) No</span>
          </div>
          <div class="vote-result-track">
            <div class="vote-result-yes-fill" style="width:${yesPct}%"></div>
            <div class="vote-result-no-fill"  style="width:${noPct}%"></div>
          </div>
        </div>
      </div>`;
    show('proposal-vote-banner');
  } else {
    hide('proposal-vote-banner');
  }

  // Hide reply form if closed
  if (proposal.status === 'closed') {
    hide('reply-form-wrap');
  } else {
    show('reply-form-wrap');
  }

  // Replies
  const repliesList = document.getElementById('replies-list');
  if (!replies.length) {
    repliesList.innerHTML = '<div class="empty-state" style="padding:20px">No replies yet — start the discussion.</div>';
  } else {
    repliesList.innerHTML = replies.map(r => `
      <div class="reply-card">
        <div class="reply-author">${r.author_display_name}</div>
        <div class="reply-body">${r.body}</div>
        <div class="reply-time">${timeAgo(r.created_at)}</div>
      </div>`).join('');
  }
}

// ── REPLY ─────────────────────────────────────────────────────────────────────

async function submitReply() {
  const body = document.getElementById('reply-body').value.trim();
  if (!body || !currentProposalId) return;

  const btn = document.querySelector('#reply-form-wrap .btn-accent');
  btn.disabled = true; btn.textContent = '…';

  try {
    const { error } = await getSB().from('proposal_replies').insert({
      proposal_id:          currentProposalId,
      author_user_id:       currentUser.user_id,
      author_display_name:  currentUser.display_name || currentUser.username,
      body,
    });
    if (error) throw error;
    document.getElementById('reply-body').value = '';
    await loadProposalDetail(currentProposalId);
    showToast('Reply posted!');
  } catch(e) {
    showToast('Failed: ' + e.message, true);
  }
  btn.disabled = false; btn.textContent = 'Reply';
}

// ── VOTE ──────────────────────────────────────────────────────────────────────

async function castProposalVote(proposalId, vote) {
  try {
    const { error } = await getSB().from('proposal_votes').upsert({
      proposal_id:          proposalId,
      voter_user_id:        currentUser.user_id,
      voter_display_name:   currentUser.display_name || currentUser.username,
      vote,
    }, { onConflict: 'proposal_id,voter_user_id' });
    if (error) throw error;
    showToast(`Voted ${vote}!`);
    await loadProposalDetail(proposalId);
  } catch(e) {
    showToast('Failed: ' + e.message, true);
  }
}
