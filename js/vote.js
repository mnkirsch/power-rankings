// ═══════════════════════════════════════════════
//  VOTE PAGE
// ═══════════════════════════════════════════════

async function renderVotePage() {
  if (!leagueData) return;
  const { sr, um } = leagueData;
  document.getElementById('vote-week-chip').textContent = weekLabel(currentWeek);
  
  // My roster
  const myRoster = sr.find(r => r.owner_id === currentUser.user_id);
  if (myRoster) {
    const u = um[myRoster.owner_id];
    const avEl = document.getElementById('vote-av');
    avEl.innerHTML = u?.avatar
      ? `<img src="${SLEEPER_CDN}${u.avatar}" onerror="this.parentElement.innerHTML='🏈'" style="width:100%;height:100%;object-fit:cover"/>`
      : '🏈';
    document.getElementById('vote-team-name').textContent = teamName(myRoster, um);
  }

  // Check existing vote
  const existing = await getMyVote(currentLeague.id, currentWeek, currentUser.user_id);
  const alreadyVoted = document.getElementById('already-voted-msg');
  if (existing) {
    alreadyVoted.style.display = 'block';
    buildVoteList(sr, um, existing.rankings);
  } else {
    alreadyVoted.style.display = 'none';
    buildVoteList(sr, um, {});
  }
  updateVoteStatus();
}

function buildVoteList(sr, um, prefill) {
  const list = document.getElementById('vote-list');
  list.innerHTML = '';
  const n = sr.length;
  sr.forEach((r, i) => {
    const u = um[r.owner_id];
    const isMe = r.owner_id === currentUser.user_id;
    const rec = `${r.settings.wins}-${r.settings.losses}`;
    let opts = '<option value="">—</option>';
    for (let j = 1; j <= n; j++) {
      opts += `<option value="${j}"${prefill[r.roster_id] == j ? ' selected' : ''}>${j}</option>`;
    }
    const card = document.createElement('div');
    card.className = 'vcard' + (isMe ? ' is-me' : '');
    card.innerHTML = `
      <div class="vcard-num">${i + 1}</div>
      ${avatarDiv(u?.avatar, 'sm-av')}
      <div class="vcard-info">
        <div class="vcard-name">${teamName(r, um)}${isMe ? '<span class="pill pill-green">You</span>' : ''}</div>
        <div class="vcard-owner">${ownerName(r, um)} · ${rec}</div>
      </div>
      <div class="rank-wrap">
        <label>Rank</label>
        <select class="rank-sel" data-roster="${r.roster_id}">${opts}</select>
      </div>`;
    list.appendChild(card);
    card.querySelector('select').addEventListener('change', () => {
      markDuplicates(); updateVoteStatus();
    });
  });
}

function markDuplicates() {
  const sels = [...document.querySelectorAll('.rank-sel')];
  const counts = {};
  sels.forEach(s => { if (s.value) counts[s.value] = (counts[s.value] || 0) + 1; });
  sels.forEach(s => s.classList.toggle('dup', !!s.value && counts[s.value] > 1));
}

function updateVoteStatus() {
  const sels = [...document.querySelectorAll('.rank-sel')];
  const vals = sels.map(s => s.value).filter(Boolean);
  const n = leagueData?.rosters?.length || 0;
  const btn = document.getElementById('sub-btn');
  const st = document.getElementById('vstatus');

  if (vals.length < n) {
    st.textContent = `${vals.length} / ${n} teams ranked`;
    btn.disabled = true; return;
  }
  if (new Set(vals).size < n) {
    st.textContent = '⚠ Duplicate ranks — each must be unique';
    btn.disabled = true; return;
  }
  btn.disabled = false;
  st.textContent = 'Ready ✓';
}

async function submitVote() {
  const sels = [...document.querySelectorAll('.rank-sel')];
  const entries = sels.map(s => ({ r: s.dataset.roster, v: parseInt(s.value) })).filter(e => e.v);
  const n = leagueData.rosters.length;
  if (entries.length !== n || new Set(entries.map(e => e.v)).size !== n) {
    showToast('Rank all teams with unique ranks first.', true); return;
  }
  const rankings = {};
  entries.forEach(e => rankings[e.r] = e.v);

  const btn = document.getElementById('sub-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    await saveVote(currentLeague.id, currentWeek, currentUser, rankings);
    showToast('Rankings submitted! 🏆');
    document.getElementById('already-voted-msg').style.display = 'block';
  } catch(e) {
    showToast('Failed to save: ' + e.message, true);
  }
  btn.disabled = false; btn.textContent = 'Submit Rankings';
  updateVoteStatus();
}
