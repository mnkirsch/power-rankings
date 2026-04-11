// ═══════════════════════════════════════════════
//  SUMMARY PAGE
// ═══════════════════════════════════════════════

async function renderSummaryPage() {
  if (!leagueData) return;
  document.getElementById('sum-week-chip').textContent = `Week ${currentWeek}`;

  const summaryRow = await getSummary(currentLeague.id, currentWeek);

  if (summaryRow?.summary_text) {
    hide('summary-empty');
    show('summary-content');
    const date = new Date(summaryRow.generated_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    document.getElementById('summary-meta').textContent = `Generated ${date} · Week ${currentWeek}`;
    document.getElementById('summary-body').textContent = summaryRow.summary_text;
  } else {
    show('summary-empty');
    hide('summary-content');
  }

  if (isCommissioner) {
    show('gen-panel');
    buildGenPreview();
  } else {
    hide('gen-panel');
  }
}

function buildGenPreview() {
  const { sr, um } = leagueData;
  const wrap = document.getElementById('gen-standings-preview');
  wrap.innerHTML = sr.map((r, i) => {
    const rec = `${r.settings.wins}-${r.settings.losses}`;
    const pts = seasonPts(r);
    return `<div class="gp-row">
      <span class="gp-pos">${i + 1}</span>
      ${avatarDiv(um[r.owner_id]?.avatar, 'sm-av', 24)}
      <span class="gp-name">${teamName(r, um)}</span>
      <span class="gp-rec">${rec}</span>
      <span class="gp-pts">${pts}</span>
    </div>`;
  }).join('');
}

async function generateSummary() {
  const apiKey = document.getElementById('anthro-key').value.trim();
  if (!apiKey) { showErr('gen-err', 'Missing Key', 'Enter your Anthropic API key above.'); return; }

  const btn = document.getElementById('gen-btn');
  btn.disabled = true; btn.textContent = 'Generating…';
  clearErr('gen-err');

  try {
    const { sr, um } = leagueData;

    const [votes, prevHistory, curHistory] = await Promise.all([
      getVotesForWeek(currentLeague.id, currentWeek),
      currentWeek > 1 ? getRankingHistory(currentLeague.id).then(h => h.filter(x => x.week === currentWeek - 1)) : Promise.resolve([]),
      getRankingHistory(currentLeague.id).then(h => h.filter(x => x.week === currentWeek)),
    ]);

    // Matchup scores
    let matchupText = '';
    try {
      const matchups = await getMatchups(currentLeague.id, currentWeek);
      const paired = {};
      matchups.forEach(m => {
        if (!paired[m.matchup_id]) paired[m.matchup_id] = [];
        paired[m.matchup_id].push(m);
      });
      matchupText = Object.values(paired).map(pair => {
        if (pair.length < 2) return '';
        const [a, b] = pair;
        const rA = sr.find(r => r.roster_id === a.roster_id);
        const rB = sr.find(r => r.roster_id === b.roster_id);
        const nA = rA ? teamName(rA, um) : `Roster ${a.roster_id}`;
        const nB = rB ? teamName(rB, um) : `Roster ${b.roster_id}`;
        return `${nA} ${a.points?.toFixed(1) || '?'} — ${b.points?.toFixed(1) || '?'} ${nB}`;
      }).filter(Boolean).join('\n');
    } catch {}

    const standingsText = sr.map((r, i) => {
      const rec = `${r.settings.wins}-${r.settings.losses}`;
      return `${i + 1}. ${teamName(r, um)} (${ownerName(r, um)}) — ${rec}, ${seasonPts(r)} pts`;
    }).join('\n');

    const rankingsText = curHistory.length
      ? curHistory.sort((a, b) => a.rank - b.rank).map(h => {
          const prev = prevHistory.find(p => p.roster_id === h.roster_id);
          const move = prev
            ? prev.rank - h.rank > 0 ? `▲${prev.rank - h.rank}`
            : prev.rank - h.rank < 0 ? `▼${Math.abs(prev.rank - h.rank)}` : '—'
            : 'new';
          return `${h.rank}. ${h.team_name} (${move})`;
        }).join('\n')
      : 'No power rankings compiled yet this week.';

    const prompt = `You are a sharp fantasy football analyst writing the weekly power rankings recap for a private league called "${currentLeague.name}".

Write a compelling weekly summary covering:
1. The overall league picture and standings
2. Notable matchup results
3. Power ranking movement — who rose, who fell, and why
4. A brief outlook for next week

Tone: Confident and direct, like a good sports columnist. Genuine personality, no forced humor or catchphrases. Honest assessments. No emoji overload.

Target length: 350–450 words. Flowing paragraphs only, no bullet points.

---
LEAGUE: ${currentLeague.name}
WEEK: ${currentWeek}

STANDINGS:
${standingsText}

WEEK ${currentWeek} MATCHUP SCORES:
${matchupText || 'Scores not available yet.'}

POWER RANKINGS:
${rankingsText}

VOTES RECEIVED: ${votes.length} / ${sr.length}
---

Write the summary:`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `API error ${response.status}`);
    }
    const result = await response.json();
    const summaryText = result.content?.[0]?.text || '';

    await saveSummary(currentLeague.id, currentWeek, summaryText, currentUser.username);

    hide('summary-empty');
    show('summary-content');
    document.getElementById('summary-meta').textContent = `Generated just now · Week ${currentWeek}`;
    document.getElementById('summary-body').textContent = summaryText;
    showToast('Summary generated and saved! ✨');

  } catch(e) {
    showErr('gen-err', 'Failed', e.message);
  }
  btn.disabled = false; btn.textContent = 'Generate →';
}
