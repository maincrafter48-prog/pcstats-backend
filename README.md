# PC Stats backend — добровольный лидерборд игроков

Хранит статистику только тех игроков, которые сами включили
"Поделиться статистикой" в настройках скрипта PC Stats.

## Деплой на Railway (проще всего)

1. Залей эту папку (`backend/`) в отдельный репозиторий на GitHub.
2. На railway.app → New Project → Deploy from GitHub repo → выбери репозиторий.
3. Railway сам определит Node.js и запустит `npm install && npm start`.
4. Во вкладке **Variables** добавь:
   - `REPORT_SECRET` — придумай длинную случайную строку (например, сгенерируй
     командой `openssl rand -hex 32`). Этот же ключ впиши в скрипт
     в константу `REPORT_SECRET`.
5. Во вкладке **Settings → Networking** нажми "Generate Domain" — получишь
   публичный URL вида `https://your-app.up.railway.app`.
6. Этот URL:
   - впиши в скрипт как `API_BASE`
   - впиши в `arizona-currency-exchange.html` / `players.html` как `API_URL`

## Важно про диск (SQLite)

По умолчанию Railway контейнеры без volume теряют файлы при редеплое.
Если игроков будет много и данные важны — во вкладке **Volumes**
подключи постоянный диск и примонтируй его, например, в `/data`,
затем задай переменную `DB_PATH=/data/pcstats.db`.
Для старта (проверить, что всё работает) можно и без volume.

## Локальный запуск

```
npm install
REPORT_SECRET=любая-строка PORT=3000 npm start
```

## Эндпоинты

- `POST /api/report` — отправка отчёта скриптом (нужен заголовок `X-Report-Key`)
- `DELETE /api/report` — удаление своих данных (тот же заголовок, body `{ownerKey}`)
- `GET /api/players?server=Tucson&q=nick` — список игроков (публичный)
- `GET /api/players/:server/:nick` — один игрок (публичный)
- `GET /api/stats/overview` — сколько всего игроков, разбивка по серверам
