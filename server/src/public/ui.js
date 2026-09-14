function badge(text, tone) {
  return '<span class="badge badge--' + (tone || 'muted') + '">' + escHtml(text) + '</span>';
}

function emptyBlock(text) {
  return '<div class="empty-block">' + escHtml(text) + '</div>';
}

function fmtNum(n) {
  var v = Number(n);
  return isNaN(v) ? '' : String(v);
}

function statCards(elId, counts, labels) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!counts) counts = {};
  var keys = Object.keys(labels);
  var html = '<div class="stat-grid">';
  keys.forEach(function(k) {
    html += '<div class="stat-card"><div class="stat-card__value">' + fmtNum(counts[k]) + '</div>' +
      '<div class="stat-card__label">' + escHtml(labels[k]) + '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function chartBoxHtml(canvasId, title) {
  return '<div class="panel"><h3>' + escHtml(title) + '</h3>' +
    '<div class="chart-box"><canvas id="' + canvasId + '"></canvas></div></div>';
}

function drawChart(canvasId, config) {
  if (typeof Chart === 'undefined') return;
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  window.__charts = window.__charts || {};
  if (window.__charts[canvasId]) window.__charts[canvasId].destroy();
  window.__charts[canvasId] = new Chart(ctx, config);
}

function resetCharts() {
  if (!window.__charts) return;
  Object.keys(window.__charts).forEach(function(id) {
    window.__charts[id].destroy();
    delete window.__charts[id];
  });
}