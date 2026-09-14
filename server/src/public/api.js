function tokenStore() {
  return localStorage.getItem('remember') === '1' ? localStorage : sessionStorage;
}

function saveSession(data) {
  var store = tokenStore();
  store.setItem('token', data.accessToken);
  store.setItem('refreshToken', data.refreshToken);
  store.setItem('user', JSON.stringify(data.user));
}

function clearSession() {
  localStorage.clear();
  sessionStorage.clear();
}

function logout() {
  clearSession();
  location.href = '/login';
}

async function api(url, options) {
  var token = tokenStore().getItem('token');
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var opts = Object.assign({}, options, { headers: headers });
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);

  var res = await fetch(url, opts);
  if (res.status === 401) {
    var refreshToken = tokenStore().getItem('refreshToken');
    if (refreshToken) {
      var refreshRes = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken })
      });
      if (refreshRes.ok) {
        var data = await refreshRes.json();
        saveSession(data);
        return api(url, options);
      }
    }
    clearSession();
    location.href = '/login';
    throw new Error('Not authorized');
  }
  var result = await res.json().catch(function() { return null; });
  if (!res.ok) throw new Error((result && result.error) || 'Ошибка запроса');
  return result;
}

function getCurrentUser() {
  try {
    return JSON.parse(tokenStore().getItem('user') || 'null');
  } catch {
    return null;
  }
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