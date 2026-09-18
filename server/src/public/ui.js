function badge(text, tone) {
  return '<span class="badge badge--' + (tone || 'muted') + '">' + escHtml(text) + '</span>';
}

function emptyBlock(text) {
  return '<div class="empty-block">' + escHtml(text) + '</div>';
}

function roundSmart(n) {
  var v = Number(n);
  if (!isFinite(v) || v === 0) return 0;
  var abs = Math.abs(v);
  var sign = v < 0 ? -1 : 1;
  return sign * (abs >= 0.01 ? Math.round(abs * 100) / 100 : Number(abs.toPrecision(1)));
}

function fmtNum(n) {
  if (n === null || n === undefined) return '';
  var v = Number(n);
  if (isNaN(v)) return '';
  var r = roundSmart(v);
  return String(r);
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

function initNotifications() {
  var userBar = document.querySelector('.top-bar__user');
  if (!userBar) return;

  var bell = document.createElement('div');
  bell.className = 'notif';
  bell.innerHTML = '<button type="button" class="btn btn--sm notif__bell" onclick="toggleNotif(event)">' +
    'Уведомления<span class="badge-scope">' +
    '<span id="notifBadge" class="badge badge--error" style="display:none">0</span>' +
    '</span></button>' +
    '<div id="notifPanel" class="notif__panel" style="display:none"></div>';
  userBar.insertBefore(bell, userBar.firstChild);

  var lastUnread = -1;
  var timer = null;

  async function poll() {
    var data;
    try {
      data = await api('/api/notifications/my');
    } catch (e) {
      return;
    }
    var unread = data.unreadCount || 0;
    var badge = document.getElementById('notifBadge');
    if (unread > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = unread;
    } else {
      badge.style.display = 'none';
    }

    if (lastUnread >= 0 && unread > lastUnread) {
      var delta = unread - lastUnread;
      var first = (data.notifications || [])[0];
      var msg = delta + ' нов' + (delta === 1 ? 'ое' : 'ых') + ' уведомлени' + (delta === 1 ? 'е' : 'я');
      if (first) msg = first.title + (first.message ? ' — ' + first.message : '');
      showToast(msg);
    }
    lastUnread = unread;

    var panel = document.getElementById('notifPanel');
    if (panel && panel.style.display === 'block') renderNotifPanel(panel, data.notifications || []);
  }

  function notifPushHeader() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return '';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') return '';
    return '<div class="notif__push"><button type="button" class="btn btn--sm" onclick="askPushPermission()">Разрешить уведомления</button></div>';
  }

  function renderNotifPanel(panel, items) {
    if (!items || items.length === 0) {
      panel.innerHTML = notifPushHeader() + '<div class="notif__empty">Нет уведомлений</div>';
      return;
    }
    panel.innerHTML = notifPushHeader() + '<div class="notif__list">' + items.map(function(n) {
      return '<a class="notif__item' + (n.isRead ? '' : ' notif__item--new') + '" ' +
        'href="javascript:void(0)" onclick="openNotif(\'' + n.id + '\',\'' + n.link + '\')">' +
        '<div class="notif__title">' + escHtml(n.title) + '</div>' +
        '<div class="notif__msg">' + escHtml(n.message || '') + '</div>' +
        '<div class="notif__date">' + fmtDate(n.createdAt) + '</div></a>';
    }).join('') + '</div>';
  }

  function open() {
    var panel = document.getElementById('notifPanel');
    if (panel.style.display === 'block') {
      panel.style.display = 'none';
      return;
    }
    renderNotifPanel(panel, []);
    poll();
    panel.style.display = 'block';
    api('/api/notifications/my').then(function(data) {
      renderNotifPanel(panel, data.notifications || []);
    }).catch(function() {});
  }

  window.toggleNotif = function(e) {
    if (e) e.stopPropagation();
    open();
  };
  window.openNotif = async function(id, link) {
    try {
      await api('/api/notifications/' + id + '/read', { method: 'POST' });
    } catch (e) {}
    document.getElementById('notifPanel').style.display = 'none';
    if (link) window.location.href = link;
    poll();
  };
  window.reloadNotifPanel = function () { poll(); };
  document.addEventListener('click', function(e) {
    var panel = document.getElementById('notifPanel');
    var bellEl = document.querySelector('.notif');
    if (panel && bellEl && !bellEl.contains(e.target)) panel.style.display = 'none';
  });

  poll();
  if (timer) clearInterval(timer);
  timer = setInterval(poll, 15000);
}