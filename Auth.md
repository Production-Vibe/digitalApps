// === АВТОРИЗАЦИЯ ===
function checkAuth(login, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) {
    return {success: false, error: 'Лист Сотрудники не найден'};
  }
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const rowLogin = data[i][0] ? data[i][0].toString().trim() : '';
    const rowPassword = data[i][1] ? data[i][1].toString().trim() : '';
    
    if (rowLogin === login && rowPassword === password) {
      let execUrl = '';
      try { execUrl = ScriptApp.getService().getUrl(); } catch (e) { execUrl = ''; }
      return {
        success: true,
        name: data[i][2] ? data[i][2].toString().trim() : '',
        role: data[i][3] ? data[i][3].toString().trim() : '',
        execUrl: execUrl
      };
    }
  }
  return {success: false};
}

// === doGet (HTML-страницы) ===
function doGet(e) {
  const page = e ? e.parameter.page : 'login';
  const naryadId = e ? e.parameter.id : '';
  const role = e ? e.parameter.role : '';
  const name = e ? e.parameter.name : '';
  
  let html;
  switch(page) {
    case 'login':
      html = renderLogin(naryadId);
      break;
    case 'operator':
      html = renderOperatorPage(name, naryadId);
      break;
    case 'otk':
    case 'master':
      html = renderAfterLogin(name, role);
      break;
    case 'master-app':
      html = renderMasterAppPage(name);
      break;
    case 'naryad':
      html = renderNaryad(naryadId, role, name);
      break;
    default:
      html = renderLogin(naryadId);
  }
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('ЦифровойНаряд')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// === Вспомогательная функция экранирования HTML ===
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Абсолютный базовый URL веб-приложения (без завершающего слеша).
// Используется для навигации на верхнем уровне (вход/выход): относительные
// ссылки типа "?page=login" резолвятся от внутреннего URL песочницы
// (script.googleusercontent.com) и уводят в «пустоту», поэтому переходим
// всегда по ScriptApp.getService().getUrl().
function appBaseUrl() {
  var url = ScriptApp.getService().getUrl() || '';
  if (url.slice(-1) === '/') url = url.slice(0, -1);
  return url;
}

// === СТРАНИЦА ВХОДА ===
function renderLogin(naryadId) {
  const serverNaryadId = naryadId || '';
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Вход в систему учета нарядов</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #eef2f7; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
    .login-container { background: white; border-radius: 24px; padding: 40px; max-width: 400px; width: 90%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
    .logo { text-align: center; font-size: 48px; margin-bottom: 20px; }
    h2 { text-align: center; color: #0f172a; margin-bottom: 8px; font-size: 24px; }
    .subtitle { text-align: center; color: #64748b; margin-bottom: 24px; font-size: 14px; }
    input { width: 100%; padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; margin-bottom: 16px; transition: all 0.2s; }
    input:focus { outline: none; border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.1); }
    button { width: 100%; padding: 12px; background: #0f172a; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    button:hover { background: #1e293b; transform: translateY(-1px); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { color: #ef4444; text-align: center; margin-top: 12px; font-size: 14px; min-height: 20px; }
    .remember-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; color: #64748b; }
</style>
</head>
<body>
  <div class="login-container" id="loginBox">
    <div class="logo">🔐</div>
    <h2>ЦифровойНаряд</h2>
    
    <div id="autoLoginLoader" style="display:none; text-align:center; padding: 24px 0;">
      <div style="font-size:36px;margin-bottom:12px;">⏳</div>
      <div style="color:#64748b;font-size:14px;">Вход...</div>
    </div>
    
    <div id="loginFormFields" style="display:none;">
      <div class="subtitle">Введите логин и пароль</div>
      <input type="text" id="login" placeholder="Логин" autofocus>
      <input type="password" id="password" placeholder="Пароль">
      <div class="remember-row">
        <input type="checkbox" id="rememberMe" checked style="width:auto;margin:0;">
        <label for="rememberMe">Запомнить меня на этом устройстве</label>
      </div>
      <button id="loginBtn" onclick="login()">Войти</button>
      <div id="errorMsg" class="error"></div>
      <div id="openInBrowserHint" style="display:none; margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 12px; color: #92400e; text-align: center;">
        💡 Если вход постоянно слетает — попробуйте открыть эту ссылку в обычном браузере (Safari/Chrome), а не через камеру/QR-сканер: некоторые сканеры открывают временное окно без сохранения данных.
        <br><a href="#" onclick="window.open(window.location.href, '_blank'); return false;" style="color:#92400e;font-weight:600;">Открыть в браузере →</a>
      </div>
    </div>
  </div>
  
  <script>
    // ID наряда из QR-кода. Берём сразу два источника — то, что распарсил
    // сервер (doGet -> e.parameter.id, надёжно всегда), и на всякий случай
    // то, что видит сам браузер в адресной строке. Первое приоритетнее.
    window.__qrNaryadId = ${JSON.stringify(serverNaryadId)} ||
      new URLSearchParams(window.location.search).get('id') || '';
    
    // Ключи для "запомнить меня" — храним логин/пароль в localStorage
    // браузера этого устройства, чтобы не спрашивать их при каждом заходе.
    const LS_LOGIN = 'nd_login';
    const LS_PASSWORD = 'nd_password';
    
    function saveCredentials(loginVal, passwordVal) {
      try {
        localStorage.setItem(LS_LOGIN, loginVal);
        localStorage.setItem(LS_PASSWORD, passwordVal);
      } catch (e) { /* localStorage недоступен — просто не запоминаем */ }
    }
    
    function clearCredentials() {
      try {
        localStorage.removeItem(LS_LOGIN);
        localStorage.removeItem(LS_PASSWORD);
      } catch (e) {}
    }
    
    // Браузер НЕ выполняет <script>, вставленный через innerHTML — это
    // стандартное поведение DOM, а не баг Apps Script. Страница оператора
    // содержит скрипт (вкладки, загрузка данных), поэтому после подстановки
    // HTML-фрагмента нужно вручную пересоздать и заново вставить каждый
    // <script>, чтобы браузер его действительно выполнил.
    function runInsertedScripts(container) {
      const scripts = container.querySelectorAll('script');
      scripts.forEach(function(oldScript) {
        const newScript = document.createElement('script');
        for (let i = 0; i < oldScript.attributes.length; i++) {
          const attr = oldScript.attributes[i];
          newScript.setAttribute(attr.name, attr.value);
        }
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    }
    
    // Страница входа центрирует контент через "body { display:flex;
    // justify-content:center; align-items:center }" — это правило живёт в
    // <style> внутри <head> и НЕ исчезает при замене document.body.innerHTML
    // (мы меняем только содержимое body, а не сам тег <body> и уж тем более
    // не <head>). Поэтому все вставляемые дальше страницы (оператор/ОТК/
    // мастер) без этого сброса тоже оказываются прижаты к центру экрана.
    // Инлайн-стиль имеет более высокий приоритет, чем правило из <style>,
    // поэтому явно перебиваем нужные свойства.
    function resetBodyLayout() {
      document.body.style.display = 'block';
      document.body.style.minHeight = '0';
      document.body.style.justifyContent = 'unset';
      document.body.style.alignItems = 'unset';
    }
    
    function login() {
      const loginVal = document.getElementById('login').value.trim();
      const passwordVal = document.getElementById('password').value.trim();
      const remember = document.getElementById('rememberMe').checked;
      performLogin(loginVal, passwordVal, remember, false);
    }
    
    function performLogin(loginVal, passwordVal, remember, isAuto) {
      const errorEl = document.getElementById('errorMsg');
      const btn = document.getElementById('loginBtn');
      
      if (!loginVal || !passwordVal) {
        if (!isAuto) errorEl.innerHTML = '❌ Введите логин и пароль';
        return;
      }
      
      if (!isAuto) {
        errorEl.innerHTML = '⏳ Проверка...';
        btn.disabled = true;
      }
      
      google.script.run
        .withSuccessHandler(function(result) {
          if (result.success) {
            if (remember) saveCredentials(loginVal, passwordVal);
            
            if (result.role === 'operator') {
              const savedId = window.__qrNaryadId || '';
              google.script.run
                .withSuccessHandler(function(fragmentHtml) {
                  document.body.innerHTML = fragmentHtml;
                  resetBodyLayout();
                  runInsertedScripts(document.body);
                })
                .withFailureHandler(function(error) {
                  btn.disabled = false;
                  errorEl.innerHTML = '❌ Ошибка загрузки: ' + error;
                })
                .getOperatorPageFragment(result.name, savedId);
              return;
            }
            if (result.role === 'master') {
              // Мастер открывается ПОЛНОЙ страницей ?page=master-app (doGet ->
              // renderMasterAppPage). Вставка фрагмента через innerHTML +
              // runInsertedScripts НЕ работает: песочница Apps Script (CSP)
              // не выполняет динамически вставленный inline-<script>, поэтому
              // дерево остаётся на вечной "Загрузка...". В полной странице
              // <script> входит в исходно выданный документ и выполняется
              // браузером нативно.
              //
              // Навигацию делаем на ВЕРХНЕЕ окно по URL запущенного веб-
              // приложения, а не через window.location (внутри iframe ведёт
              // на мёртвый путь). URL берём СЕРВЕРОМ (ScriptApp.getService()
              // .getUrl()) — клиент не может надёжно вычислить его из
              // document.referrer/window.top (кросс-ориджин песочницы).
              let execBase = result.execUrl || '';
              if (execBase) {
                if (execBase.slice(-1) === '/') execBase = execBase.slice(0, -1);
              }
              if (!execBase) {
                try {
                  const ref = document.referrer || '';
                  const base = ref ? new URL(ref, window.top.location.origin) : null;
                  if (base) execBase = base.origin + base.pathname;
                } catch (e) { /* fallback ниже */ }
              }
              if (!execBase) {
                try { execBase = window.top.location.origin; } catch (e2) {}
              }
              const q = new URLSearchParams({ page: 'master-app', name: result.name || '' }).toString();
              if (execBase) {
                window.top.location.href = execBase + '?' + q;
              } else {
                errorEl.innerHTML = '❌ Не удалось открыть страницу мастера';
                btn.disabled = false;
              }
              return;
            }
            // Для остальных ролей — быстрый фрагмент без перезагрузки
            google.script.run
              .withSuccessHandler(function(fragmentHtml) {
                document.body.innerHTML = fragmentHtml;
                resetBodyLayout();
              })
              .withFailureHandler(function(error) {
                btn.disabled = false;
                errorEl.innerHTML = '❌ Ошибка загрузки: ' + error;
              })
              .getAfterLoginFragment(result.name, result.role);
          } else {
            btn.disabled = false;
            if (isAuto) {
              // Сохранённые данные больше не подходят (например, сменили
              // пароль) — тихо забываем их и показываем обычную форму входа.
              clearCredentials();
              document.getElementById('autoLoginLoader').style.display = 'none';
              document.getElementById('loginFormFields').style.display = 'block';
              errorEl.innerHTML = '';
            } else {
              errorEl.innerHTML = '❌ Неверный логин или пароль';
              document.getElementById('password').value = '';
              document.getElementById('password').focus();
            }
          }
        })
        .withFailureHandler(function(error) {
          btn.disabled = false;
          if (isAuto) {
            document.getElementById('autoLoginLoader').style.display = 'none';
            document.getElementById('loginFormFields').style.display = 'block';
            errorEl.innerHTML = '';
          } else {
            errorEl.innerHTML = '❌ Ошибка сервера: ' + error;
          }
        })
        .checkAuth(loginVal, passwordVal);
    }
    
    // Вход по Enter
    document.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') login();
    });
    
    // Автовход: если на этом устройстве уже сохранены логин/пароль —
    // сразу показываем только лоадер, форму входа не показываем вовсе
    // (чтобы не создавалось впечатление, будто нужно вводить данные заново).
    (function tryAutoLogin() {
      let savedLogin, savedPassword;
      try {
        savedLogin = localStorage.getItem(LS_LOGIN);
        savedPassword = localStorage.getItem(LS_PASSWORD);
      } catch (e) {
        // localStorage вообще недоступен (часто бывает во временных
        // in-app браузерах QR-сканеров) — сразу показываем форму входа.
        document.getElementById('loginFormFields').style.display = 'block';
        if (window.__qrNaryadId) document.getElementById('openInBrowserHint').style.display = 'block';
        return;
      }
      if (!savedLogin || !savedPassword) {
        // Сохранённого входа нет — сразу показываем форму, без лишнего лоадера.
        document.getElementById('loginFormFields').style.display = 'block';
        if (window.__qrNaryadId) document.getElementById('openInBrowserHint').style.display = 'block';
        return;
      }
      
      document.getElementById('autoLoginLoader').style.display = 'block';
      performLogin(savedLogin, savedPassword, true, true);
    })();
  </script>
</body>
</html>
  `;
}

// === СТРАНИЦА ПОСЛЕ ВХОДА ===
// Полный вариант (для прямого перехода по URL, ?page=operator и т.д.)
function renderAfterLogin(name, role) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ЦифровойНаряд</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #eef2f7; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
  </style>
</head>
<body>
  ${getAfterLoginFragment(name, role)}
</body>
</html>
  `;
}

// Фрагмент карточки "Вход выполнен" — переиспользуется и при полной загрузке
// страницы (renderAfterLogin), и при вызове через google.script.run с клиента
// (без перезагрузки/навигации — работает даже в песочнице предпросмотра редактора).
function getAfterLoginFragment(name, role) {
  const roleLabels = {
    'operator': 'Оператор',
    'otk': 'ОТК',
    'master': 'Мастер'
  };
  const roleLabel = roleLabels[role] || role;
  
  return `
    <style>
      .card { background: white; border-radius: 24px; padding: 40px; max-width: 500px; width: 90%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); text-align: center; margin: 40px auto; }
      .logo { font-size: 48px; margin-bottom: 20px; }
      .card h2 { color: #0f172a; margin-bottom: 8px; }
      .info { color: #64748b; margin-bottom: 24px; font-size: 14px; }
      .btn { display: inline-block; padding: 12px 24px; background: #0f172a; color: white; border: none; border-radius: 8px; text-decoration: none; margin: 8px; cursor: pointer; }
      .btn:hover { background: #1e293b; }
      .btn-outline { background: transparent; color: #0f172a; border: 1px solid #cbd5e1; }
      .btn-outline:hover { background: #f1f5f9; }
      .logout { margin-top: 20px; color: #94a3b8; font-size: 13px; }
      .logout a { color: #ef4444; text-decoration: none; cursor: pointer; }
      .role-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; background: #dbeafe; color: #1d4ed8; margin-top: 8px; }
    </style>
    <div class="card">
      <div class="logo">✅</div>
      <h2>Вход выполнен</h2>
      <p class="info">
        👤 <strong>${escapeHtml(name)}</strong><br>
        <span class="role-badge">${escapeHtml(roleLabel)}</span>
      </p>
      <p style="margin: 16px 0; color: #64748b; font-size: 14px;">
        🗂️ Работайте через <strong>Google Таблицу</strong><br>
        Все изменения и просмотр — там.
      </p>
      <div>
        <a onclick="try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){};location.reload()" class="btn">Выйти</a>
        <a href="https://docs.google.com/spreadsheets/d/12g5YaTk6fKmpA7UZLKcG42LBGlZHUHRpnKOSuIr7EBg" target="_blank" class="btn btn-outline">📊 Открыть таблицу</a>
      </div>
      <div class="logout">
        <a onclick="try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){};location.reload()">Выйти из системы</a>
      </div>
    </div>
  `;
}