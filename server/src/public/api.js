async function api(url, options) {
  var token = localStorage.getItem('token');
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var opts = Object.assign({}, options, { headers: headers });
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);

  var res = await fetch(url, opts);
  if (res.status === 401) {
    var refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      var refreshRes = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken })
      });
      if (refreshRes.ok) {
        var data = await refreshRes.json();
        localStorage.setItem('token', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        return api(url, options);
      }
    }
    localStorage.clear();
    location.href = '/login';
    throw new Error('Not authorized');
  }
  var result = await res.json().catch(function() { return null; });
  if (!res.ok) throw new Error((result && result.error) || 'Ошибка запроса');
  return result;
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
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