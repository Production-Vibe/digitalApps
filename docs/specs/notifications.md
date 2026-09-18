# Уведомления ролей — спека (Фаза 1: внутренние + Фаза 2: Web Push)

Статус: Фаза 1 — реализовано (Этап 8); Фаза 2 Web Push — реализовано (Этап 12).

## Цель

Операторы, нач. смены, ОТК и мастера внутри приложения видят новые события
по роли/оператору: бейдж на «колокольчике» в шапке + тост при появлении +
dropdown со списком. Работает на любом устройстве (включая телефон), пока
вкладка открыта. При закрытой вкладке — системные Web Push (Фаза 2).

## Модель данных

`Notification` (11-я модель, `server/prisma/schema.prisma`):

| Поле | Тип | Назначение |
|---|---|---|
| `id` | String @id cuid | |
| `targetLogin` | String? | адресат-оператор (логин сотрудника) |
| `targetRole` | EmployeeRole? | адресат-роль (otk / shift / master / operator) |
| `type` | String | `naryad_issued`, `waiting_otk`, `rework`, `launch_created`, `naryad_closed` |
| `title` | String | заголовок («Новый наряд» и т.п.) |
| `message` | String? | детали (номер наряда / обозначение / кол-во) |
| `link` | String? | маршрут перехода при клике (`/operator`, `/otk`, …) |
| `isRead` | Boolean @default(false) | |
| `createdAt` | DateTime @default(now()) | |

Индексы: `[targetLogin, isRead]`, `[targetRole, isRead]`.

## Сервер

### lib/notify.ts — фабрика событий

- `notifyOperator(fullName, data)` — резолвит `Employees` по `fullName`
  (поле `WorkOrders.operator` хранит ФИО — «Иванов И. И.»), пишет запись
  с `targetLogin`. Если сотрудник не найден — молча пропускает.
- `notifyRole(role, data)` — пишет запись с `targetRole` для всех сотрудников роли.

### Точки-хуки (события → получатели)

| Событие | Хук | Получатель | type |
|---|---|---|---|
| Наряд выдан | `workorders.routes.ts` `POST /issue` | оператор (по `operator`) | `naryad_issued` |
| Готов к ОТК | `transition-logic.ts` `updateNaryadStatus` (переход в `waiting_otk`) | otk | `waiting_otk` |
| Доработка | `otk.routes.ts` `POST /rework` | оператор | `rework` |
| Новый запуск | `launches.routes.ts` `POST /` | shift | `launch_created` |
| Наряд закрыт | `otk.routes.ts` `POST /close` | оператор + master + shift | `naryad_closed` |

Уведомление «готов к ОТК» срабатывает только при смене статуса
(`newStatus !== order.status`), чтобы не дублировать на каждый переход.

### REST-модуль `notifications.routes.ts` (подключён в `app.ts`, префикс `/api/notifications`)

- `GET /my` — свои уведомления: `WHERE targetLogin=user.login OR targetRole=user.role`;
  ответ `{ unreadCount, notifications }` (последние 50, по `createdAt desc`).
- `POST /:id/read` — пометить прочитанным (только своё).
- `POST /read-all` — пометить все свои прочитанными.

Все под `requireAuth('operator','shift','otk','master')`.

## Клиент

### Виджет «колокольчик» — `ui.js` `initNotifications()`

Инжектится в `.top-bar__user` шапок всех 4 ролей (`operator.ejs`,
`shift-app.ejs`, `otk-app.ejs`, `master-app.ejs` — вызов после проверки роли):

- кнопка «Уведомления» с бейджем непрочитанных (`#notifBadge`);
- dropdown `#notifPanel`: список уведомлений (непрочитанные выделены);
- клик по пункту — `POST /:id/read` + переход по `link`;
- поллинг `GET /my` каждые **15 с** (setInterval), при росте `unreadCount` — тост
  (`showToast`) с title/сообщением первого нового;
- клик вне виджета закрывает dropdown.

Стили — в `styles.css` (`.notif__*`), тёмная шапка: бейдж на токене `--error`.

## Desktop/mobile

Колокольчик виден на всех 4 ролях с любого устройства, где открыта вкладка.
Пока вкладка закрыта — уведомления накапливаются в БД и показываются бейджем
при следующем входе (не читаются автоматически).

## Проверки

- `npm run build` + `npm run check` PASS.
- E2E 26/26 PASS (селекторы не менялись; в тексте оператора появилась кнопка «Уведомления»).
- API-smoke 14/14 PASS полного цикла: запуск→shift, выдача→оператор,
  переход→ОТК (waiting_otk), rework→оператор, закрытие→мастер/shift/оператор,
  mark-read, read-all.
- UI-probe: колокольчик виден, бейдж=1, dropdown с текстом, клик → переход по
  ссылке, бейдж скрывается. Тест-данные удалены (стенд чист).

## Фаза 2 — Web Push (реализовано, Этап 12)

- PWA: `manifest.webmanifest` + Service Worker (`public/sw.js`); страницы
  ролей и `/login` подключают manifest/theme-color/иконки (включая
  `apple-touch-icon`); приём `push`/`notificationclick` — в `public/sw.js`.
- Иконка приложения — авторские placeholder-PNG (`public/icons/`,
  `server/scripts/make-icons.ts`, цвета `#131c30`/`#2563eb`), заменяются на
  реальный логотип позже.
- Таблица `PushSubscription` (12-я модель): `login`, `endpoint @unique`,
  `p256dh`, `auth`, `createdAt`, индекс `[login]`.
- REST `routes/push.routes.ts` (префикс `/api/push`, все под
  `requireAuth('operator','shift','otk','master')`):
  - `GET /vapid-key` → `{ publicKey }` (берётся из `config.vapidPublicKey`);
  - `POST /subscribe` — upsert по endpoint (`p256dh/server`-валидация endpoint:
    https или http://localhost);
  - `POST /unsubscribe` — `deleteMany` по `login`+endpoint.
- VAPID-ключи — в `server/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `APP_URL`); генерация — `npm run push:keys`; сервер
  (необязательно) конфигурирует `web-push` через `lib/push.ts`
  (`initWebPush`, `isPushConfigured`, `dispatchPush(login[], data)`):
  TTL 86400, при 404/410 подписка удаляется из БД.
- `lib/notify.ts` дополнен: `notifyOperator`/`notifyRole` после записи в
  `Notification` рассылают `web-push` по подпискам адресата (роль резолвится
  в логины). Push слайды отправляются только если VAPID сконфигурирован.
- Клиент `public/push-init.js` (`initPush` после `initNotifications` на всех 4
  ролях):
  - регистрирует `/sw.js`; при `Notification.permission === 'granted'` сразу
    подписывается (`pushManager.subscribe` с `applicationServerKey` из
    `/api/push/vapid-key`) и `POST /subscribe`;
  - при `default` — в dropdown «Уведомления» показывается кнопка
    «Разрешить уведомления» (`notifPushHeader` в `ui.js`; клик →
    `window.askPushPermission`, поддержка iOS 16.4+, PWA «на главный экран»);
  - при `denied`/неподдержке — кнопка скрывается.
- Проверки Этапа 12: `npm run build` + `npm run check` PASS; /health ok;
  push-probe 13/13 (auth-gate 401, SW-регистрация, авто-подписка выполняет
  путь без console-error, subscribe=upsert/400/удаление в БД); ролевой E2E
  26/26 PASS; bizcycle 51/51 PASS; стенд чист (PushSubscription=0).