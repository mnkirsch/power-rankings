// ═══════════════════════════════════════════════
//  HISTORY PAGE
// ═══════════════════════════════════════════════

let historyChart = null;

const CHART_COLORS = [
  '#2DFF7B','#FFB731','#4D9FFF','#FF4D6A','#2DD4BF',
  '#FF8C42','#A78BFA','#34D399','#F472B6','#FACC15',
  '#60A5FA','#FB923C',
];
const CHART_DASHES = [
  [], [6,3], [3,3], [8,2,2,2], [4,4],
  [2,2], [6,2,2,2], [5,5], [3,6], [2,6],
  [8,3], [4,2],
];

async function renderHistoryPage() {
  if (!leagueData) return;

  const history = await getRankingHistory(currentLeague.id);

  if (!history.length) {
    show('history-empty');
    return;
  }
  hide('history-empty');

  const weeks  = [...new Set(history.map(h => h.week))].sort((a, b) => a - b);
  const teams  = [...new Set(history.map(h => h.team_name))];
  const n      = leagueData.rosters.length;

  const datasets = teams.map((team, i) => ({
    label: team,
    data: weeks.map(w => {
      const h = history.find(x => x.team_name === team && x.week === w);
      return h ? h.rank : null;
    }),
    borderColor:       CHART_COLORS[i % CHART_COLORS.length],
    pointBackgroundColor: CHART_COLORS[i % CHART_COLORS.length],
    borderDash:        CHART_DASHES[i % CHART_DASHES.length],
    tension:           0.35,
    pointRadius:       4,
    pointHoverRadius:  8,
    borderWidth:       2,
    fill:              false,
    spanGaps:          true,
  }));

  // Build legend
  const legend = document.getElementById('history-legend');
  legend.innerHTML = teams.map((team, i) => `
    <div class="legend-item">
      <div class="legend-swatch" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
      <span>${team}</span>
    </div>`).join('');

  if (historyChart) historyChart.destroy();
  const ctx = document.getElementById('history-chart').getContext('2d');
  historyChart = new Chart(ctx, {
    type: 'line',
    data: { labels: weeks.map(w => `Wk ${w}`), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true,
          min: 1, max: n,
          ticks: {
            stepSize: 1,
            color: '#4a5478',
            font: { family: 'Barlow Condensed', size: 12 },
            callback: v => `#${v}`,
          },
          grid: { color: 'rgba(30,39,72,.8)' },
          title: {
            display: true, text: 'Power Rank',
            color: '#4a5478', font: { family: 'Barlow Condensed', size: 12 },
          },
        },
        x: {
          ticks: {
            color: '#4a5478',
            font: { family: 'Barlow Condensed', size: 12 },
            autoSkip: false, maxRotation: 0,
          },
          grid: { color: 'rgba(30,39,72,.8)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b1028',
          borderColor: '#2a3560',
          borderWidth: 1,
          titleColor: '#FFB731',
          bodyColor: '#EDF0FF',
          titleFont: { family: 'Barlow Condensed', size: 14, weight: '700' },
          bodyFont: { family: 'Barlow', size: 13 },
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: #${ctx.parsed.y}`,
          },
        },
      },
    },
  });
}
