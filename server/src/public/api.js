var accessToken = null;
var currentUser = null;

function setSession(user, token) {
  currentUser = user;
  accessToken = token;
}

function getCurrentUser() {
  return currentUser;
}

async function initSession() {
  try {
    var res = await fetch('/api/session', { method: 'GET' });
    if (!res.ok) throw new Error('not authorized');
    var data = await res.json();
    setSession(data.user, data.accessToken);
    return data.user;
  } catch (e) {
    location.href = '/login';
    return null;
  }
}

async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  accessToken = null;
  currentUser = null;
  location.href = '/login';
}

async function api(url, options) {
  var headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
  var opts = Object.assign({}, options, { headers: headers });
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);

  var res = await fetch(url, opts);
  if (res.status === 401) {
    var refreshRes = await fetch('/api/refresh', { method: 'POST' });
    if (refreshRes.ok) {
      var data = await refreshRes.json();
      accessToken = data.accessToken;
      return api(url, options);
    }
    accessToken = null;
    currentUser = null;
    location.href = '/login';
    throw new Error('Not authorized');
  }
  var result = await res.json().catch(function() { return null; });
  if (!res.ok) throw new Error((result && result.error) || 'Ошибка запроса');
  return result;
}

function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, isError) {
  var el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast ' + (isError ? 'toast--error' : 'toast--ok');
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(function() { el.style.display = 'none'; }, 3000);
}

async function fetchJSON(url, options) {
  return api(url, options);
}