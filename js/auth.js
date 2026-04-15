// ═══════════════════════════════════════════════
//  AUTH — login / logout / session / routing
// ═══════════════════════════════════════════════

let currentUser    = null;
let currentLeague  = null;
let leagueData     = null;
let currentWeek    = 1;
let isCommissioner = false;

// ── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  if (CONFIG.supabaseUrl === 'https://edrmasdqceghodetpfhn.supabase.co') {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    showLoginScreen();
    showErr('login-err', 'Setup Required', 'Add your Supabase credentials to js/config.js — see README.md.');
    return;
  }
  try { getSB(); } catch(e) { console.error('Supabase init failed', e); }
  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  showLoginScreen();
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────

function onUsernameInput() {
  const v = document.getElementById('login-uname').value.trim().toLowerCase();
  document.getElementById('comm-pw-wrap').style.display =
    v === CONFIG.commissionerUsername.toLowerCase() ? 'block' : 'none';
  clearErr('login-err');
  document.getElementById('league-picker').style.display = 'none';
}

async function doLogin() {
  const uname = document.getElementById('login-uname').value.trim();
  if (!uname) { showErr('login-err', 'Required', 'Enter your Sleeper username.'); return; }

  const btn = document.getElementById('login-btn');
  const btnText = document.getElementById('login-btn-text');
  btn.disabled = true; btnText.textContent = 'Signing in…';
  clearErr('login-err');

  try {
    const isComm = uname.toLowerCase() === CONFIG.commissionerUsername.toLowerCase();
    if (isComm) {
      const pw = document.getElementById('comm-pw').value;
      if (pw !== CONFIG.commissionerPassword) {
        showErr('login-err', 'Wrong Password', 'Incorrect commissioner password.');
        btn.disabled = false; btnText.textContent = 'Sign In';
        return;
      }
      isCommissioner = true;
    } else {
      isCommissioner = false;
    }

    const user = await getUser(uname);
    currentUser = user;

    const nflState = await getNFLState();
    currentWeek = nflState.week || 1;

    const memberOf = [];
    for (const id of CONFIG.leagueIds) {
      try {
        const users = await getLeagueUsers(id);
        if (users?.find(u => u.user_id === user.user_id)) {
          const info = await getLeague(id);
          memberOf.push({ id, name: info.name, info, users });
        }
      } catch {}
    }

    if (!memberOf.length) throw new Error('not_in_league');
    if (memberOf.length === 1) {
      await loadLeague(memberOf[0]);
    } else {
      renderLeaguePicker(memberOf);
    }

  } catch(e) {
    if (e.message === 'not_found' || e.message.includes('404')) {
      showErr('login-err', 'Username Not Found',
        `No Sleeper account for "@${document.getElementById('login-uname').value.trim()}". ` +
        `Check the spelling — it's the @handle in your Sleeper profile.`);
    } else if (e.message === 'not_in_league') {
      showErr('login-err', 'Not In League', `Your account isn't in either of the two leagues this app covers.`);
    } else {
      showErr('login-err', 'Error', e.message);
    }
  }

  btn.disabled = false; btnText.textContent = 'Sign In';
}

function renderLeaguePicker(leagues) {
  const opts = document.getElementById('league-opts');
  opts.innerHTML = '';
  leagues.forEach(l => {
    const d = document.createElement('div');
    d.className = 'league-opt';
    d.innerHTML = `${avatarDiv(l.info.avatar, 'lo-av', 38)}
      <div>
        <div class="lo-name">${l.name}</div>
        <div class="lo-meta">${l.info.total_rosters} teams · ${(l.info.sport||'NFL').toUpperCase()} ${l.info.season}</div>
      </div>`;
    d.onclick = () => loadLeague(l);
    opts.appendChild(d);
  });
  document.getElementById('league-picker').style.display = 'block';
}

async function loadLeague(league) {
  document.getElementById('login-btn').disabled = true;
  document.getElementById('login-btn-text').textContent = 'Loading…';
  try {
    const [rosters, users] = await Promise.all([
      getLeagueRosters(league.id),
      league.users || getLeagueUsers(league.id),
    ]);
    const um = buildUsersMap(users);
    const sr = sortedRosters(rosters);
    currentLeague = league;
    leagueData = { rosters, users, um, sr };
    enterApp();
  } catch(e) {
    showErr('login-err', 'Load Error', e.message);
    document.getElementById('login-btn').disabled = false;
    document.getElementById('login-btn-text').textContent = 'Sign In';
  }
}

function enterApp() {
  document.getElementById('league-chip').textContent = currentLeague.name;
  const uav = document.getElementById('user-chip-av');
  if (currentUser.avatar) {
    uav.innerHTML = `<img src="${SLEEPER_CDN}${currentUser.avatar}" onerror="this.parentElement.innerHTML='👤'" style="width:100%;height:100%;object-fit:cover"/>`;
  }
  document.getElementById('user-chip-name').textContent = currentUser.display_name || currentUser.username;

  // Show commissioner nav item
  const commBtn = document.getElementById('comm-nav-btn');
  if (commBtn) commBtn.style.display = isCommissioner ? 'inline-block' : 'none';

  showMainScreen();
  switchPage('home', document.querySelector('.tnav-item'));
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────

function logout() {
  currentUser = null; currentLeague = null; leagueData = null; isCommissioner = false;
  if (typeof playersCache !== 'undefined') { playersCache = null; matchupsCache = null; }
  if (typeof historyChart !== 'undefined' && historyChart) { historyChart.destroy(); historyChart = null; }
  if (typeof currentProposalId !== 'undefined') currentProposalId = null;
  document.getElementById('login-uname').value = '';
  document.getElementById('comm-pw').value = '';
  document.getElementById('comm-pw-wrap').style.display = 'none';
  document.getElementById('league-picker').style.display = 'none';
  clearErr('login-err');
  showLoginScreen();
}

// ── SCREEN / PAGE ROUTING ─────────────────────────────────────────────────────

function showLoginScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-login').classList.add('active');
}

function showMainScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-main').classList.add('active');
}

function switchPage(name, btn) {
  // Update nav
  document.querySelectorAll('.tnav-item').forEach(n => n.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Swap page
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const pg = document.getElementById(`page-${name}`);
  if (pg) { pg.style.display = 'block'; pg.classList.add('active'); }

  // Load data
  if      (name === 'home')          renderHomePage();
  else if (name === 'vote')          renderVotePage();
  else if (name === 'rankings')      renderRankingsPage();
  else if (name === 'summary')       renderSummaryPage();
  else if (name === 'teams')         renderTeamsPage();
  else if (name === 'proposals')     renderProposalsPage();
  else if (name === 'commissioner')  renderCommissionerPage();

  // Scroll to top
  window.scrollTo(0, 0);
}

// ── SHARED UI ─────────────────────────────────────────────────────────────────

function showErr(elId, title, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<strong>${title}</strong> ${msg}`;
  el.style.display = 'block';
}
function clearErr(elId) {
  const el = document.getElementById(elId);
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
